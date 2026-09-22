#!/bin/bash
# Row-Level Security + grants para el rol de aplicación.
# Se ejecuta como shell para inyectar el nombre del rol app desde el entorno.
set -euo pipefail

psql -v ON_ERROR_STOP=1 -v app_user="${APP_DB_USER}" \
     --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-'SQL'

  -- Permisos de datos para el rol app sobre las tablas de dominio.
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :"app_user";
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO :"app_user";

  -- Helper: tenant actual desde la config de sesión (NULL si no seteado).
  CREATE OR REPLACE FUNCTION current_tenant() RETURNS uuid
  LANGUAGE sql STABLE AS $fn$
    SELECT NULLIF(current_setting('app.current_tenant', true), '')::uuid
  $fn$;

  DO $do$
  DECLARE t text;
  BEGIN
    FOREACH t IN ARRAY ARRAY[
      'categories','locations','assets','custody_assignments','devices',
      'geofences','maintenance_plans','maintenance_events','alerts',
      'notification_settings','audit_log','telemetry'
    ]
    LOOP
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
      EXECUTE format($f$
        CREATE POLICY tenant_isolation ON %I
          USING (tenant_id = current_tenant())
          WITH CHECK (tenant_id = current_tenant());
      $f$, t);
    END LOOP;
  END $do$;
SQL
