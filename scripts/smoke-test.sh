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
$COMPOSE up -d --build db redis mqtt api web

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

ASSET=$(curl -sf -X POST "$API/assets" "${auth[@]}" -H 'Content-Type: application/json' \
  -d '{"name":"Motogenerador","tier":"gps","value_usd":4000}' | jq -r .asset.id)
[ -n "$ASSET" ] && [ "$ASSET" != "null" ] || { echo "❌ crear activo falló"; exit 1; }
echo "✓ activo creado"

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

# Alta de dispositivo GPS vinculado al activo + ingesta vía adapter de Traccar.
IMEI="86012345$(date +%s | tail -c 7)"
curl -sf -X POST "$API/devices" "${auth[@]}" -H 'Content-Type: application/json' \
  -d "{\"kind\":\"gps\",\"identifier\":\"$IMEI\",\"assetId\":\"$ASSET\"}" >/dev/null
DVCOUNT=$(curl -sf "$API/devices" "${auth[@]}" | jq '.devices | length')
[ "$DVCOUNT" -ge 1 ] || { echo "❌ alta de dispositivo falló"; exit 1; }
echo "✓ dispositivo dado de alta y vinculado al activo"

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

# Verificar aislamiento RLS: un tenant nuevo no ve el activo anterior.
TOKEN2=$(curl -sf -X POST "$API/auth/register" -H 'Content-Type: application/json' \
  -d "{\"company\":\"Otra SA\",\"name\":\"B\",\"email\":\"smoke2+$(date +%s)@trazza.test\",\"password\":\"secret123\"}" | jq -r .token)
COUNT2=$(curl -sf "$API/assets" -H "Authorization: Bearer $TOKEN2" | jq '.assets | length')
[ "$COUNT2" = "0" ] || { echo "❌ fuga entre tenants (RLS): otro tenant vio $COUNT2 activos"; exit 1; }
echo "✓ aislamiento multitenant (RLS) verificado"

echo ""
echo "✅ SMOKE TEST OK — init de la base y flujo funcional validados."
