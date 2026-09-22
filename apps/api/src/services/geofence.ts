import type { PoolClient } from 'pg';
import { enqueueAlert } from './notifications.js';

/**
 * Evalúa la posición de un activo contra las geocercas del tenant.
 * - Si queda fuera de TODAS las geocercas (habiendo al menos una) → genera una
 *   alerta `geofence_exit` (sin duplicar si ya hay una abierta).
 * - Si vuelve a entrar a alguna → resuelve las alertas abiertas del activo.
 * Debe ejecutarse dentro de una transacción con el tenant seteado (withTenant).
 */
export async function evaluateGeofence(
  client: PoolClient,
  assetId: string | null,
  lng: number | null,
  lat: number | null,
): Promise<void> {
  if (!assetId || lng == null || lat == null) return;

  const g = await client.query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (
              WHERE ST_Contains(polygon, ST_SetSRID(ST_MakePoint($1, $2), 4326))
            )::int AS inside
       FROM geofences`,
    [lng, lat],
  );
  const { total, inside } = g.rows[0] as { total: number; inside: number };
  if (total === 0) return;

  if (inside === 0) {
    const ins = await client.query(
      `INSERT INTO alerts (tenant_id, asset_id, kind, severity, message)
       SELECT current_tenant(), $1, 'geofence_exit', 'warning',
              'El activo salió de la zona permitida'
        WHERE NOT EXISTS (
          SELECT 1 FROM alerts
           WHERE asset_id = $1 AND kind = 'geofence_exit' AND resolved_at IS NULL
        )
       RETURNING id, asset_id, kind, severity, message`,
      [assetId],
    );
    if (ins.rowCount) await enqueueAlert(client, ins.rows[0]);
  } else {
    await client.query(
      `UPDATE alerts SET resolved_at = now()
        WHERE asset_id = $1 AND kind = 'geofence_exit' AND resolved_at IS NULL`,
      [assetId],
    );
  }
}
