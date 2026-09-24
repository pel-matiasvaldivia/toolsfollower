#!/usr/bin/env bash
# ===========================================================================
# Trazza — smoke test del stack completo (requiere Docker + jq + curl).
# Levanta db/redis/mqtt/api/web, valida el init de la base (PostGIS, Timescale,
# RLS) y corre un flujo funcional: registro -> activo -> geocerca -> alerta.
#
#   ./scripts/smoke-test.sh            # levanta, testea y hace teardown
#   KEEP_UP=1 ./scripts/smoke-test.sh  # deja el stack corriendo al final
# ===========================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

command -v docker >/dev/null || { echo "❌ falta docker"; exit 1; }
command -v jq >/dev/null || { echo "❌ falta jq"; exit 1; }

if [ ! -f .env ]; then
  cp .env.example .env
  echo "ℹ️  Creé .env desde .env.example (valores de ejemplo, sólo para el test)."
fi
set -a; . ./.env; set +a

COMPOSE="docker compose -f docker-compose.yml -f docker-compose.dev.yml"
API="http://localhost:${API_PORT:-8091}"
DB_NAME="${POSTGRES_DB:-trazza}"

cleanup() {
  if [ "${KEEP_UP:-0}" = "1" ]; then
    echo "ℹ️  KEEP_UP=1: dejo el stack corriendo."
  else
    echo "🧹 Teardown…"; $COMPOSE down -v >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "🚀 Levantando stack (build local)…"
$COMPOSE up -d --build db redis mqtt minio api web bridge notifier

echo "⏳ Esperando a la API…"
ok=""
for _ in $(seq 1 60); do
  if curl -sf "$API/health" >/dev/null 2>&1; then ok=1; break; fi
  sleep 2
done
[ -n "$ok" ] || { echo "❌ la API no respondió a tiempo"; $COMPOSE logs api | tail -40; exit 1; }
echo "✓ API arriba"

echo "🔎 Validando init de la base…"
EXT=$($COMPOSE exec -T db psql -U "${POSTGRES_USER:-postgres}" -d "$DB_NAME" -tAc \
  "SELECT string_agg(extname, ',' ORDER BY extname) FROM pg_extension WHERE extname IN ('postgis','timescaledb','pgcrypto');")
echo "   extensiones: $EXT"
[[ "$EXT" == *postgis* && "$EXT" == *timescaledb* ]] || { echo "❌ faltan extensiones"; exit 1; }

HYPER=$($COMPOSE exec -T db psql -U "${POSTGRES_USER:-postgres}" -d "$DB_NAME" -tAc \
  "SELECT count(*) FROM timescaledb_information.hypertables WHERE hypertable_name='telemetry';")
[ "$HYPER" = "1" ] || { echo "❌ falta la hypertable telemetry"; exit 1; }
echo "✓ PostGIS + TimescaleDB + hypertable OK"

RLS=$($COMPOSE exec -T db psql -U "${POSTGRES_USER:-postgres}" -d "$DB_NAME" -tAc \
  "SELECT count(*) FROM pg_policies WHERE policyname='tenant_isolation';")
[ "$RLS" -ge 10 ] || { echo "❌ RLS no aplicado (policies: $RLS)"; exit 1; }
echo "✓ RLS por tenant aplicado ($RLS tablas)"

echo "🧪 Flujo funcional…"
EMAIL="smoke+$(date +%s)@trazza.test"
REG=$(curl -sf -X POST "$API/auth/register" -H 'Content-Type: application/json' \
  -d "{\"company\":\"Smoke SA\",\"name\":\"Test\",\"email\":\"$EMAIL\",\"password\":\"secret123\"}")
TOKEN=$(echo "$REG" | jq -r .token)
TENANT=$(echo "$REG" | jq -r .tenant.id)
[ -n "$TOKEN" ] && [ "$TOKEN" != "null" ] || { echo "❌ registro falló"; exit 1; }
auth=(-H "Authorization: Bearer $TOKEN")
echo "✓ registro + JWT"

# Depósito (location) y activo asignado a él.
LOC=$(curl -sf -X POST "$API/locations" "${auth[@]}" -H 'Content-Type: application/json' \
  -d '{"name":"Deposito central","kind":"depot"}' | jq -r .location.id)
[ -n "$LOC" ] && [ "$LOC" != "null" ] || { echo "❌ crear depósito falló"; exit 1; }
echo "✓ depósito creado"

ASSET=$(curl -sf -X POST "$API/assets" "${auth[@]}" -H 'Content-Type: application/json' \
  -d "{\"name\":\"Motogenerador\",\"tier\":\"gps\",\"value_usd\":4000,\"locationId\":\"$LOC\"}" | jq -r .asset.id)
[ -n "$ASSET" ] && [ "$ASSET" != "null" ] || { echo "❌ crear activo falló"; exit 1; }
ALOC=$(curl -sf "$API/assets" "${auth[@]}" | jq -r --arg id "$ASSET" '[.assets[] | select(.id==$id)][0].location_name')
[ "$ALOC" = "Deposito central" ] || { echo "❌ el activo no quedó vinculado al depósito (loc=$ALOC)"; exit 1; }
echo "✓ activo creado y asignado al depósito"

curl -sf -X POST "$API/geofences" "${auth[@]}" -H 'Content-Type: application/json' \
  -d '{"name":"Deposito","center":[-68.8458,-32.8895],"radiusM":100}' >/dev/null
echo "✓ geocerca creada"

# Posición lejos de la geocerca -> debe generar alerta geofence_exit.
curl -sf -X POST "$API/assets/$ASSET/position" "${auth[@]}" -H 'Content-Type: application/json' \
  -d '{"lat":-33.2,"lng":-69.2,"battery":80}' >/dev/null

OPEN=$(curl -sf "$API/alerts" "${auth[@]}" | jq '[.alerts[] | select(.kind=="geofence_exit" and .resolved_at==null)] | length')
[ "$OPEN" -ge 1 ] || { echo "❌ no se generó la alerta de geocerca"; exit 1; }
echo "✓ alerta geofence_exit generada"

# Mantenimiento por horas: plan cada 100 h, luego reportar 500 h -> vencido.
curl -sf -X POST "$API/maintenance/plans" "${auth[@]}" -H 'Content-Type: application/json' \
  -d "{\"assetId\":\"$ASSET\",\"strategy\":\"hours\",\"intervalHours\":100}" >/dev/null
curl -sf -X POST "$API/assets/$ASSET/position" "${auth[@]}" -H 'Content-Type: application/json' \
  -d '{"lat":-33.2,"lng":-69.2,"engineHours":500}' >/dev/null
MDUE=$(curl -sf "$API/alerts" "${auth[@]}" | jq '[.alerts[] | select(.kind=="maintenance_due" and .resolved_at==null)] | length')
[ "$MDUE" -ge 1 ] || { echo "❌ no se generó la alerta de mantenimiento"; exit 1; }
echo "✓ alerta maintenance_due por horas de uso generada"

# Alta de dispositivo GPS vinculado al activo (devuelve la credencial una vez).
IMEI="86012345$(date +%s | tail -c 7)"
DVRESP=$(curl -sf -X POST "$API/devices" "${auth[@]}" -H 'Content-Type: application/json' \
  -d "{\"kind\":\"gps\",\"identifier\":\"$IMEI\",\"assetId\":\"$ASSET\"}")
DEVKEY=$(echo "$DVRESP" | jq -r .key)
[ -n "$DEVKEY" ] && [ "$DEVKEY" != "null" ] || { echo "❌ el alta no devolvió credencial"; exit 1; }
DVCOUNT=$(curl -sf "$API/devices" "${auth[@]}" | jq '.devices | length')
[ "$DVCOUNT" -ge 1 ] || { echo "❌ alta de dispositivo falló"; exit 1; }
echo "✓ dispositivo dado de alta (con credencial) y vinculado al activo"

# Ingesta autenticada por credencial de dispositivo (sin tenantId en el body).
curl -sf -X POST "$API/telemetry/ingest" -H "X-Device-Key: $DEVKEY" \
  -H 'Content-Type: application/json' \
  -d '{"lat":-32.895,"lng":-68.842,"battery":58}' >/dev/null
KBATT=$(curl -sf "$API/assets" "${auth[@]}" | jq --arg id "$ASSET" '[.assets[] | select(.id==$id)][0].last_battery')
[ "$KBATT" = "58" ] || { echo "❌ la ingesta por credencial no actualizó el activo (battery=$KBATT)"; exit 1; }
echo "✓ ingesta por credencial de dispositivo (X-Device-Key) verificada"
# Una credencial inválida debe ser rechazada.
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/telemetry/ingest" \
  -H "X-Device-Key: trz_invalida" -H 'Content-Type: application/json' -d '{"lat":-32,"lng":-68}')
[ "$CODE" = "401" ] || { echo "❌ credencial inválida no fue rechazada (HTTP $CODE)"; exit 1; }
echo "✓ credencial inválida rechazada (401)"

# El adapter de Traccar resuelve el activo por IMEI y actualiza su posición.
curl -sf -X POST "$API/adapters/traccar?tenantId=$TENANT&token=${INGEST_TOKEN}" \
  -H 'Content-Type: application/json' \
  -d "{\"device\":{\"uniqueId\":\"$IMEI\"},\"position\":{\"latitude\":-32.89,\"longitude\":-68.84,\"attributes\":{\"batteryLevel\":77}}}" >/dev/null
BATT=$(curl -sf "$API/assets" "${auth[@]}" | jq --arg id "$ASSET" '[.assets[] | select(.id==$id)][0].last_battery')
[ "$BATT" = "77" ] || { echo "❌ el adapter de Traccar no actualizó el activo (battery=$BATT)"; exit 1; }
echo "✓ adapter de Traccar → ingesta por IMEI verificada"

# Alta de dispositivo LoRa + ingesta vía adapter LoRaWAN (formato ChirpStack).
DEVEUI="0102030405060708"
curl -sf -X POST "$API/devices" "${auth[@]}" -H 'Content-Type: application/json' \
  -d "{\"kind\":\"lora\",\"identifier\":\"$DEVEUI\",\"assetId\":\"$ASSET\"}" >/dev/null
curl -sf -X POST "$API/adapters/lorawan?tenantId=$TENANT&token=${INGEST_TOKEN}" \
  -H 'Content-Type: application/json' \
  -d "{\"deviceInfo\":{\"devEui\":\"$DEVEUI\"},\"object\":{\"latitude\":-32.90,\"longitude\":-68.85,\"battery\":63}}" >/dev/null
LBATT=$(curl -sf "$API/assets" "${auth[@]}" | jq --arg id "$ASSET" '[.assets[] | select(.id==$id)][0].last_battery')
[ "$LBATT" = "63" ] || { echo "❌ el adapter LoRaWAN no actualizó el activo (battery=$LBATT)"; exit 1; }
echo "✓ adapter LoRaWAN (ChirpStack) → ingesta por DevEUI verificada"

# Bridge MQTT: publicar en trazza/<tenant>/<imei> y verificar que el activo se actualiza.
$COMPOSE exec -T mqtt mosquitto_pub -h localhost -t "trazza/$TENANT/$IMEI" \
  -m '{"lat":-32.88,"lng":-68.83,"battery":42}'
MBATT=""
for _ in $(seq 1 15); do
  MBATT=$(curl -sf "$API/assets" "${auth[@]}" | jq --arg id "$ASSET" '[.assets[] | select(.id==$id)][0].last_battery')
  [ "$MBATT" = "42" ] && break
  sleep 1
done
[ "$MBATT" = "42" ] || { echo "❌ el bridge MQTT no actualizó el activo (battery=$MBATT)"; $COMPOSE logs bridge | tail -20; exit 1; }
echo "✓ bridge MQTT → ingesta por topic verificada"

# Foto de activo: pedir URL prefirmada, subir a MinIO y confirmar.
PHOTO=$(curl -sf -X POST "$API/assets/$ASSET/photo-upload" "${auth[@]}" \
  -H 'Content-Type: application/json' -d '{"contentType":"image/png"}')
PUTURL=$(echo "$PHOTO" | jq -r .uploadUrl)
PKEY=$(echo "$PHOTO" | jq -r .key)
[ -n "$PUTURL" ] && [ "$PUTURL" != "null" ] || { echo "❌ no se generó la URL prefirmada"; exit 1; }
printf '\x89PNG\r\n\x1a\n' > /tmp/trazza-smoke.png
curl -sf -X PUT --data-binary @/tmp/trazza-smoke.png -H 'Content-Type: image/png' "$PUTURL" >/dev/null
curl -sf -X PUT "$API/assets/$ASSET/photo" "${auth[@]}" \
  -H 'Content-Type: application/json' -d "{\"key\":\"$PKEY\"}" >/dev/null
PURL=$(curl -sf "$API/assets" "${auth[@]}" | jq -r --arg id "$ASSET" '[.assets[] | select(.id==$id)][0].photo_url')
[ -n "$PURL" ] && [ "$PURL" != "null" ] || { echo "❌ el activo no quedó con foto"; exit 1; }
echo "✓ foto de activo subida a MinIO (URL prefirmada) verificada"

# Notificaciones: configurar destinatarios y verificar el flujo del outbox.
curl -sf -X PUT "$API/notifications/settings" "${auth[@]}" -H 'Content-Type: application/json' \
  -d '{"enabled":true,"emails":"jefe@obra.test","whatsapp":"+5492610000000","minSeverity":"warning"}' >/dev/null
NSET=$(curl -sf "$API/notifications/settings" "${auth[@]}" | jq -r .settings.emails)
[ "$NSET" = "jefe@obra.test" ] || { echo "❌ no se guardó la config de notificaciones"; exit 1; }
echo "✓ configuración de notificaciones guardada"

# La alerta geofence_exit generada antes debe haberse encolado en el outbox…
OBX=$($COMPOSE exec -T db psql -U "${POSTGRES_USER:-postgres}" -d "$DB_NAME" -tAc \
  "SELECT count(*) FROM notification_outbox WHERE tenant_id='$TENANT' AND kind='geofence_exit';")
[ "$OBX" -ge 1 ] || { echo "❌ la alerta no se encoló en el outbox (filas: $OBX)"; exit 1; }
echo "✓ alerta encolada en el outbox de notificaciones"

# …y el worker notifier debe procesarla (sin SMTP configurado igual marca sent_at).
PEND=""
for _ in $(seq 1 15); do
  PEND=$($COMPOSE exec -T db psql -U "${POSTGRES_USER:-postgres}" -d "$DB_NAME" -tAc \
    "SELECT count(*) FROM notification_outbox WHERE tenant_id='$TENANT' AND sent_at IS NULL;")
  [ "$PEND" = "0" ] && break
  sleep 1
done
[ "$PEND" = "0" ] || { echo "❌ el notifier no procesó el outbox (pendientes: $PEND)"; $COMPOSE logs notifier | tail -20; exit 1; }
echo "✓ worker notifier procesó el outbox"

# Verificar aislamiento RLS: un tenant nuevo no ve el activo anterior.
TOKEN2=$(curl -sf -X POST "$API/auth/register" -H 'Content-Type: application/json' \
  -d "{\"company\":\"Otra SA\",\"name\":\"B\",\"email\":\"smoke2+$(date +%s)@trazza.test\",\"password\":\"secret123\"}" | jq -r .token)
COUNT2=$(curl -sf "$API/assets" -H "Authorization: Bearer $TOKEN2" | jq '.assets | length')
[ "$COUNT2" = "0" ] || { echo "❌ fuga entre tenants (RLS): otro tenant vio $COUNT2 activos"; exit 1; }
echo "✓ aislamiento multitenant (RLS) verificado"

echo ""
echo "✅ SMOKE TEST OK — init de la base y flujo funcional validados."
