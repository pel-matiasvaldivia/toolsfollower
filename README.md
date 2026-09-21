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
```

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
   - (opcional) `s3.tudominio.com` → MinIO `:9000`, `minio.tudominio.com` → `:9001`

   > Si NPM corre en Docker, poné el stack de Trazza y NPM en la misma red o apuntá a la
   > IP del host. Firewall: exponé al público solo los puertos vía NPM.

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
| POST | `/telemetry/ingest` | Ingesta de dispositivos (header `X-Ingest-Token`) |

Ejemplo de ingesta:
```bash
curl -X POST http://api.tudominio.com/telemetry/ingest \
  -H "X-Ingest-Token: $INGEST_TOKEN" -H "Content-Type: application/json" \
  -d '{"tenantId":"<uuid>","deviceIdentifier":"IMEI123","lat":-32.89,"lng":-68.84,"battery":92}'
```

## Escalado horizontal

- **API stateless**: escalá con `docker compose up -d --scale api=N` detrás de NPM (o un
  balanceador). El estado vive en Postgres/Redis, no en el proceso.
- **Web**: estática, cacheable; replicá o serví por CDN.
- **DB**: primer paso, mover Postgres a su propio VPS + réplicas de lectura.

## Roadmap

MVP actual: auth multitenant, activos, custodia (esquema), ingesta de telemetría, KPIs y
landing. Siguiente: mapa en vivo (MapLibre), geocercas + motor de alertas (Redis/BullMQ),
mantenimiento por horas de uso, subida de fotos a MinIO y adapters de dispositivos.
