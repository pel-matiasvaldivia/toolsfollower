# Trazza

**Seguimiento de herramientas para constructoras.** Plataforma SaaS multitenant para
saber dónde está cada equipo, quién es el responsable y cuándo mantenerlo — combinando
GPS, LoRaWAN y RFID en una sola pantalla.

## Arquitectura

```
Internet → Nginx Proxy Manager (TLS) → [ web :WEB_PORT ]  → SPA + landing (nginx)
                                                └ /api → api :8080
                                        → [ api :API_PORT ] → Fastify (REST + ingesta)
                                        → [ minio, mqtt ]  (opcionales por NPM)

api ── PostgreSQL (TimescaleDB + PostGIS, RLS por tenant)
    ── Redis (cache/colas)
    ── MinIO (fotos/documentos)
mqtt (Mosquitto) ── ingesta de dispositivos GPS/LoRa
bridge ── consume el broker MQTT y normaliza cada mensaje a la ingesta
traccar ── recibe los protocolos de los rastreadores y reenvía
           posiciones a api:8080/adapters/traccar (red interna)
```

Los rastreadores GPS del campo se conectan a **Traccar** (dentro del stack), que
traduce sus protocolos binarios y **reenvía cada posición a la API por la red interna
de Docker** (`http://api:8080/adapters/traccar`). No hay que instalar nada aparte.

| Componente | Tecnología | Imagen |
|---|---|---|
| API | Fastify + TypeScript | `ghcr.io/<owner>/trazza-api` (node:22-alpine, no-root) |
| Web | React + Vite + Tailwind | `ghcr.io/<owner>/trazza-web` (nginx-unprivileged) |
| DB | PostgreSQL 16 + TimescaleDB + PostGIS | `timescale/timescaledb-ha:pg16` |
| Cache | Redis 7 | `redis:7-alpine` |
| MQTT | Mosquitto 2 | `eclipse-mosquitto:2` |
| Storage | MinIO | `minio/minio` |

Las imágenes de API y Web se buildean en **GitHub Actions** (multi-arch amd64/arm64,
multi-stage, no-root) y se publican en **GHCR**. El stack de producción las **consume**;
no compila nada en el VPS.

## Multitenancy

Base y esquema compartidos, aislamiento por `tenant_id` + **Row-Level Security** de
PostgreSQL. La API se conecta con un rol **no-superusuario** (`trazza_app`) y en cada
request hace `SET LOCAL app.current_tenant = <uuid>`, de modo que las políticas RLS
filtran automáticamente. Las tablas de auth (`tenants`, `users`, `memberships`) quedan
fuera de RLS y se controlan por código.

## Despliegue en el VPS (con Nginx Proxy Manager)

1. Cloná el repo y configurá el entorno:
   ```bash
   cp .env.example .env
   nano .env   # completá contraseñas, JWT_SECRET, INGEST_TOKEN e IMAGE_REPO
   ```
2. Autenticá Docker contra GHCR (si el repo/paquete es privado):
   ```bash
   echo $GITHUB_TOKEN | docker login ghcr.io -u <usuario> --password-stdin
   ```
3. Levantá el stack (tira las imágenes de GHCR):
   ```bash
   docker compose pull
   docker compose up -d
   ```
4. En **Nginx Proxy Manager**, creá los Proxy Hosts:
   - `app.tudominio.com` → `127.0.0.1:${WEB_PORT}` (8090)
   - `api.tudominio.com` → `127.0.0.1:${API_PORT}` (8091)
   - (opcional) `traccar.tudominio.com` → `127.0.0.1:${TRACCAR_PORT}` (8082) — UI de Traccar
   - (opcional) `s3.tudominio.com` → MinIO `:9000`, `minio.tudominio.com` → `:9001`

   > Si NPM corre en Docker, poné el stack de Trazza y NPM en la misma red o apuntá a la
   > IP del host. Firewall: exponé al público solo los puertos web vía NPM **más los
   > puertos de protocolo de Traccar** (rango `5000-5150` TCP/UDP), a los que se conectan
   > los rastreadores directamente (no pasan por NPM). Podés acotar el rango a los puertos
   > de tus equipos (Teltonika 5027, GT06/Concox 5023, Queclink 5002…).

5. Completá `TRACCAR_TENANT_ID` en `.env` con el UUID del cliente (lo ves en el panel →
   **Dispositivos**) para que Traccar sepa a qué tenant asignar las posiciones, y reiniciá
   Traccar: `docker compose up -d traccar`.

El frontend llama a `/api` y nginx lo proxea al contenedor `api`; además el puerto de la
API queda expuesto aparte para dispositivos y apps móviles.

## Desarrollo local

```bash
cp .env.example .env
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
# Web:  http://localhost:8090     API: http://localhost:8091/health
```

O sin Docker, cada app por separado:
```bash
cd apps/api && npm install && npm run dev     # :8080
cd apps/web && npm install && npm run dev      # :5173 (proxya /api -> :8091)
```

## Endpoints principales (API)

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/auth/register` | Crea empresa (tenant) + usuario owner |
| POST | `/auth/login` | Devuelve JWT |
| GET | `/me` | Usuario autenticado |
| GET | `/assets` | Lista activos del tenant |
| POST | `/assets` | Crea activo |
| GET | `/summary` | KPIs para el dashboard |
| POST | `/assets/:id/position` | Actualiza posición/horas de un activo (evalúa geocercas y mantenimiento) |
| GET/POST | `/geofences` | Geocercas (círculo o polígono), GeoJSON |
| GET | `/alerts` | Alertas (geocerca, mantenimiento, batería) |
| GET/POST | `/maintenance/plans` | Planes de mantenimiento (por calendario u horas de uso) |
| POST | `/maintenance/plans/:id/complete` | Registra el service y reprograma el vencimiento |
| GET/POST | `/devices` | Alta y listado de dispositivos (el alta devuelve la credencial una vez) |
| PATCH/DELETE | `/devices/:id` | Vincular/desvincular a un activo o dar de baja |
| POST | `/devices/:id/rotate-key` | Rota la credencial del dispositivo (devuelve la nueva una vez) |
| POST | `/telemetry/ingest` | Ingesta (credencial `X-Device-Key`, o `X-Ingest-Token` + tenantId) |
| POST | `/adapters/traccar` | Recibe el *position forwarding* JSON de Traccar |
| POST | `/adapters/lorawan` | Recibe uplinks de ChirpStack v4 / The Things Stack v3 |

**Autenticación de la ingesta** — dos modos:

1. **Credencial por dispositivo** (recomendado para equipos que hablan HTTP directo):
   cada dispositivo recibe una clave `trz_…` al darlo de alta (se muestra una sola vez;
   la base guarda sólo su hash SHA-256). Resuelve tenant + activo por sí sola:
   ```bash
   curl -X POST https://api.tudominio.com/telemetry/ingest \
     -H "X-Device-Key: trz_xxxxxxxx" -H "Content-Type: application/json" \
     -d '{"lat":-32.89,"lng":-68.84,"battery":92}'
   ```
2. **Token compartido** (gateways de confianza: Traccar, LNS, bridge MQTT):
   ```bash
   curl -X POST https://api.tudominio.com/telemetry/ingest \
     -H "X-Ingest-Token: $INGEST_TOKEN" -H "Content-Type: application/json" \
     -d '{"tenantId":"<uuid>","deviceIdentifier":"IMEI123","lat":-32.89,"lng":-68.84,"battery":92}'
   ```

## Vincular dispositivos físicos

1. **Dar de alta el dispositivo** en el panel (sección *Dispositivos*) o por API:
   ```bash
   curl -X POST https://trazza.tudominio.com/api/devices \
     -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
     -d '{"kind":"gps","identifier":"860123456789012","assetId":"<uuid-activo>"}'
   ```
   El `identifier` es el **IMEI** (GPS/4G), **DevEUI** (LoRaWAN) o **EPC** (RFID).

2. **Configurar el envío de telemetría** según la tecnología:
   - **GPS/4G (Teltonika, Queclink, Concox…):** hablan protocolos binarios. **Traccar
     ya viene en el stack** y reenvía las posiciones a la API por la red interna
     (`FORWARD_URL=http://api:8080/adapters/traccar`), así que solo tenés que:
     1. Dar de alta el rastreador en la **UI de Traccar** (`traccar.tudominio.com`,
        *Devices → +*), con **Identifier = IMEI** (el mismo IMEI que cargás en Trazza).
     2. Configurar el equipo para reportar a **`<IP del VPS>:<puerto de su protocolo>`**
        (Teltonika 5027, GT06/Concox 5023, Queclink 5002…) por SMS/app del fabricante.

     El `device.uniqueId` (IMEI) resuelve el activo en Trazza; `attributes.hours` (ms)
     se convierte a horas de motor y alimenta el mantenimiento por uso. El token viaja
     en el header `X-Ingest-Token` (variable `INGEST_TOKEN`).
   - **LoRaWAN (ChirpStack v4 / The Things Stack v3):** cargá un *codec* (payload
     formatter) en el dispositivo que decodifique el payload a `latitude`/`longitude`
     (y `battery`), y creá una integración HTTP en el LNS apuntando a:
     ```
     https://trazza.tudominio.com/api/adapters/lorawan?tenantId=<uuid>
     header  X-Ingest-Token: <INGEST_TOKEN>
     ```
     El adapter detecta el formato de cada LNS y resuelve el activo por el **DevEUI**
     (dalo de alta en minúscula). Los eventos sin GPS (join, status) se ignoran con
     `202` para que el LNS no reintente.
   - **RFID:** el middleware del lector hace `POST` a `/telemetry/ingest` con el EPC
     leído en portería (presencia).
   - **Cualquiera con MQTT:** publican al broker Mosquitto (`:1883`) y el servicio
     `bridge` los ingesta. Convención de topic:
     ```
     trazza/<tenantId>/<deviceIdentifier>   payload JSON: {"lat":-32.9,"lng":-68.8,"battery":80}
     ```
     El `tenantId`/`deviceIdentifier` también pueden ir dentro del payload (topic
     genérico `trazza/ingest`). El `bridge` corre en **una sola instancia** (no
     escalar). Asegurá el broker con usuarios/ACLs en producción (`mosquitto.conf`).

## Testing

- **Unit (API):** `cd apps/api && npm test` (node --test).
- **Smoke test del stack (requiere Docker + jq):** `./scripts/smoke-test.sh` levanta
  el stack, valida el init de la base (PostGIS, TimescaleDB, hypertable, RLS) y corre
  el flujo registro → activo → geocerca → alerta → mantenimiento, más el aislamiento
  multitenant. `KEEP_UP=1 ./scripts/smoke-test.sh` deja el stack corriendo.
- **CI:** el job `verify` (typecheck + tests + build) corre como gate antes de publicar
  imágenes en GHCR.
- **Sesiones web:** `.claude/hooks/session-start.sh` instala dependencias al iniciar.

## Escalado horizontal

- **API stateless**: escalá con `docker compose up -d --scale api=N` detrás de NPM (o un
  balanceador). El estado vive en Postgres/Redis, no en el proceso.
- **Web**: estática, cacheable; replicá o serví por CDN.
- **DB**: primer paso, mover Postgres a su propio VPS + réplicas de lectura.

## Roadmap

MVP actual: auth multitenant, activos, custodia (esquema), ingesta de telemetría, KPIs y
landing, mapa en vivo (MapLibre), geocercas + motor de alertas, mantenimiento por horas
de uso, alta de dispositivos, adapters de Traccar (GPS/4G) y LoRaWAN (ChirpStack/TTS),
bridge MQTT→ingesta y credenciales por dispositivo. Siguiente: fotos de activos a MinIO.
