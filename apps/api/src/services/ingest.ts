import type { PoolClient } from 'pg';
import { evaluateGeofence } from './geofence.js';
import { evaluateMaintenance } from './maintenance.js';

export interface TelemetryPoint {
  deviceId?: string | null;         // device ya resuelto (p. ej. por clave de dispositivo)
  deviceIdentifier?: string | null; // IMEI / DevEUI / EPC
  assetId?: string | null;
  lat?: number | null;
  lng?: number | null;
  battery?: number | null;
  engineHours?: number | null;
  ts?: string | null;
  raw?: unknown;
}

/**
 * Inserta un punto de telemetría y actualiza el estado del activo, evaluando
 * geocercas y mantenimiento. Debe ejecutarse dentro de `withTenant`, con el
 * tenant ya seteado en la transacción (`current_tenant()` resuelve al activo).
 *
 * Compartido por el webhook `/telemetry/ingest` y por los adapters de
 * dispositivos (Traccar, LoRaWAN, etc.), de modo que todos normalicen igual.
 */
export async function ingestPoint(c: PoolClient, p: TelemetryPoint) {
  const lat = p.lat != null ? Number(p.lat) : null;
  const lng = p.lng != null ? Number(p.lng) : null;
  const battery = p.battery != null ? Number(p.battery) : null;
  const engineHours = p.engineHours != null ? Number(p.engineHours) : null;

  // Resolver el activo a partir del dispositivo (por id ya resuelto, o por
  // identificador) si no vino un assetId explícito.
  let assetId: string | null = p.assetId ?? null;
  let deviceId: string | null = null;
  if (p.deviceId) {
    const d = await c.query('SELECT id, asset_id FROM devices WHERE id = $1 LIMIT 1', [p.deviceId]);
    if (d.rowCount) {
      deviceId = d.rows[0].id;
      assetId = assetId ?? d.rows[0].asset_id;
    }
  } else if (p.deviceIdentifier) {
    const d = await c.query(
      'SELECT id, asset_id FROM devices WHERE identifier = $1 LIMIT 1',
      [p.deviceIdentifier],
    );
    if (d.rowCount) {
      deviceId = d.rows[0].id;
      assetId = assetId ?? d.rows[0].asset_id;
    }
  }

  await c.query(
    `INSERT INTO telemetry (tenant_id, device_id, asset_id, ts, geom, battery, engine_hours, raw)
     VALUES (current_tenant(), $1, $2, COALESCE($3::timestamptz, now()),
             CASE WHEN $4::float8 IS NULL THEN NULL
                  ELSE ST_SetSRID(ST_MakePoint($5, $4), 4326) END,
             $6, $7, $8)`,
    [deviceId, assetId, p.ts ?? null, lat, lng, battery, engineHours, p.raw ?? null],
  );

  // Última posición conocida del activo (para el mapa).
  if (assetId && lat != null && lng != null) {
    await c.query(
      `UPDATE assets
          SET last_geom = ST_SetSRID(ST_MakePoint($2, $3), 4326),
              last_battery = COALESCE($4, last_battery),
              last_seen_at = now()
        WHERE id = $1`,
      [assetId, lng, lat, battery],
    );
  }

  // Horas de motor (pueden llegar sin nueva posición).
  if (assetId && engineHours != null) {
    await c.query(
      `UPDATE assets SET last_engine_hours = $2, last_seen_at = now() WHERE id = $1`,
      [assetId, engineHours],
    );
  }

  await evaluateGeofence(c, assetId, lng, lat);
  await evaluateMaintenance(c, assetId);

  return { assetId, deviceId, resolved: assetId != null };
}
