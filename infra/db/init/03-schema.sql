-- ===========================================================================
-- Trazza — esquema de dominio
-- Multitenant: base y esquema compartidos, aislamiento por tenant_id + RLS.
-- Las tablas de auth (tenants/users/memberships) NO llevan RLS; el resto sí.
-- ===========================================================================

-- ---- Auth backbone (global) ------------------------------------------------
CREATE TABLE tenants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  name          text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       text NOT NULL DEFAULT 'member',  -- owner | admin | member
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);

-- ---- Dominio (tenant-scoped, con RLS) --------------------------------------
CREATE TABLE categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE locations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name       text NOT NULL,
  kind       text NOT NULL DEFAULT 'site',   -- site (obra) | depot (depósito)
  geom       geometry(Point, 4326),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE assets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category_id   uuid REFERENCES categories(id) ON DELETE SET NULL,
  location_id   uuid REFERENCES locations(id) ON DELETE SET NULL,
  name          text NOT NULL,
  serial        text,
  tier          text NOT NULL DEFAULT 'rfid', -- gps | lora | rfid
  value_usd     numeric(12,2),
  status        text NOT NULL DEFAULT 'active',
  photo_url     text,
  last_geom          geometry(Point, 4326),
  last_battery       int,
  last_engine_hours  numeric(10,1),
  last_seen_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON assets (tenant_id);

CREATE TABLE custody_assignments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  asset_id     uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  user_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  responsible  text,               -- nombre libre si no es usuario del sistema
  assigned_at  timestamptz NOT NULL DEFAULT now(),
  released_at  timestamptz
);
CREATE INDEX ON custody_assignments (tenant_id, asset_id);

CREATE TABLE devices (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  asset_id    uuid REFERENCES assets(id) ON DELETE SET NULL,
  kind        text NOT NULL,       -- gps | lora | rfid
  identifier  text NOT NULL,       -- IMEI / devEUI / EPC
  key_prefix  text,                -- prefijo visible de la credencial (no secreto)
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, identifier)
);

-- Credenciales por dispositivo (GLOBAL, sin RLS): permite resolver el device y
-- su tenant a partir del hash de la clave, sin conocer el tenant de antemano.
-- Igual que las tablas de auth, se controla por código (no lleva tenant_isolation).
CREATE TABLE device_keys (
  key_hash    text PRIMARY KEY,             -- sha256 de la clave
  device_id   uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON device_keys (device_id);

CREATE TABLE geofences (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id uuid REFERENCES locations(id) ON DELETE CASCADE,
  name       text NOT NULL,
  polygon    geometry(Polygon, 4326) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE maintenance_plans (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  asset_id       uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  strategy       text NOT NULL DEFAULT 'calendar', -- calendar | hours
  interval_days  int,
  interval_hours int,
  next_due_at    timestamptz,
  next_due_hours int,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE maintenance_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  asset_id     uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  plan_id      uuid REFERENCES maintenance_plans(id) ON DELETE SET NULL,
  performed_at timestamptz NOT NULL DEFAULT now(),
  notes        text
);

CREATE TABLE alerts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  asset_id    uuid REFERENCES assets(id) ON DELETE CASCADE,
  kind        text NOT NULL,   -- geofence_exit | maintenance_due | low_battery
  severity    text NOT NULL DEFAULT 'info',
  message     text NOT NULL,
  resolved_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON alerts (tenant_id, created_at DESC);

CREATE TABLE audit_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id    uuid,
  action     text NOT NULL,
  entity     text,
  entity_id  uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---- Telemetría (hypertable Timescale) -------------------------------------
CREATE TABLE telemetry (
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  device_id    uuid REFERENCES devices(id) ON DELETE SET NULL,
  asset_id     uuid REFERENCES assets(id) ON DELETE SET NULL,
  ts           timestamptz NOT NULL DEFAULT now(),
  geom         geometry(Point, 4326),
  battery      int,
  engine_hours numeric(10,1),
  raw          jsonb
);
SELECT create_hypertable('telemetry', 'ts', if_not_exists => TRUE);
CREATE INDEX ON telemetry (tenant_id, asset_id, ts DESC);
