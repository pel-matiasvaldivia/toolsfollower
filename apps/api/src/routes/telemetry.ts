import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db.js';
import { config } from '../config.js';
import { evaluateGeofence } from '../services/geofence.js';
import { evaluateMaintenance } from '../services/maintenance.js';

/**
 * Ingesta de telemetría de dispositivos (webhook HTTP; el broker MQTT puede
 * reenviar acá vía un bridge). Autenticación por token compartido para el MVP;
 * en producción, credenciales/cert por dispositivo.
 *
 * Body: { tenantId, deviceIdentifier?, assetId?, lat, lng, battery?, engineHours?, ts? }
 */
export async function registerTelemetryRoutes(app: FastifyInstance) {
  app.post('/telemetry/ingest', async (req, reply) => {
    if (req.headers['x-ingest-token'] !== config.ingestToken) {
      return reply.code(401).send({ error: 'token de ingesta inválido' });
    }
    const b = (req.body ?? {}) as Record<string, any>;
    if (!b.tenantId) return reply.code(400).send({ error: 'tenantId requerido' });
    const lat = b.lat != null ? Number(b.lat) : null;
    const lng = b.lng != null ? Number(b.lng) : null;

    return withTenant(b.tenantId, async (c) => {
      // Resolver asset por device si no viene explícito.
      let assetId: string | null = b.assetId ?? null;
      let deviceId: string | null = null;
      if (b.deviceIdentifier) {
        const d = await c.query(
          'SELECT id, asset_id FROM devices WHERE identifier = $1 LIMIT 1',
          [b.deviceIdentifier],
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
        [deviceId, assetId, b.ts ?? null, lat, lng, b.battery ?? null, b.engineHours ?? null, b.raw ?? null],
      );

      // Actualizar última posición conocida del activo (para el mapa).
      if (assetId && lat != null && lng != null) {
        await c.query(
          `UPDATE assets
              SET last_geom = ST_SetSRID(ST_MakePoint($2, $3), 4326),
                  last_battery = COALESCE($4, last_battery),
                  last_seen_at = now()
            WHERE id = $1`,
          [assetId, lng, lat, b.battery ?? null],
        );
      }

      // Horas de motor (pueden llegar sin nueva posición).
      if (assetId && b.engineHours != null) {
        await c.query(
          `UPDATE assets SET last_engine_hours = $2, last_seen_at = now() WHERE id = $1`,
          [assetId, Number(b.engineHours)],
        );
      }

      await evaluateGeofence(c, assetId, lng, lat);
      await evaluateMaintenance(c, assetId);
      return reply.code(202).send({ accepted: true });
    });
  });
}
