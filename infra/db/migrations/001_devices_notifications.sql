-- ===========================================================================
-- Migración 001 — dispositivos (credenciales) + notificaciones
-- Para bases YA inicializadas antes de estos cambios (el init de
-- docker-entrypoint-initdb.d sólo corre en una base nueva). Idempotente.
--
-- Aplicar:
--   set -a; . ./.env; set +a
--   docker compose exec -T db \
--     psql -v ON_ERROR_STOP=1 -v app_user="$APP_DB_USER" \
--          -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
--     < infra/db/migrations/001_devices_notifications.sql
-- ===========================================================================

-- --- Credenciales por dispositivo (PR #3) ---------------------------------
ALTER TABLE devices ADD COLUMN IF NOT EXISTS key_prefix text;

CREATE TABLE IF NOT EXISTS device_keys (
  key_hash    text PRIMARY KEY,
  device_id   uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS device_keys_device_id_idx ON device_keys (device_id);

-- --- Notificaciones (PR #4) -----------------------------------------------
CREATE TABLE IF NOT EXISTS notification_settings (
  tenant_id     uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  enabled       boolean NOT NULL DEFAULT true,
  emails        text,
  whatsapp      text,
  min_severity  text NOT NULL DEFAULT 'warning',
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_outbox (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  alert_id    uuid REFERENCES alerts(id) ON DELETE CASCADE,
  kind        text NOT NULL,
  severity    text NOT NULL,
  message     text NOT NULL,
  asset_name  text,
  attempts    int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  sent_at     timestamptz
);
CREATE INDEX IF NOT EXISTS notification_outbox_sent_idx ON notification_outbox (sent_at, created_at);

-- RLS por tenant en notification_settings (device_keys y notification_outbox
-- son GLOBALES, sin RLS, igual que las tablas de auth).
ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_settings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON notification_settings;
CREATE POLICY tenant_isolation ON notification_settings
  USING (tenant_id = current_tenant())
  WITH CHECK (tenant_id = current_tenant());

-- Permisos para el rol de aplicación sobre las tablas nuevas.
GRANT SELECT, INSERT, UPDATE, DELETE ON device_keys, notification_settings, notification_outbox TO :"app_user";
