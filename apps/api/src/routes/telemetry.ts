import type { FastifyInstance } from 'fastify';
import { pool, withTenant } from '../db.js';
import { config } from '../config.js';
import { ingestPoint } from '../services/ingest.js';
import { hashKey } from '../util/apikey.js';

/**
 * Ingesta de telemetría de dispositivos (webhook HTTP; el bridge MQTT y los
 * adapters también entran acá). Dos modos de autenticación:
 *
 *  1. Credencial por dispositivo (recomendado para equipos que hablan HTTP
 *     directo): header `X-Device-Key: trz_…`. Resuelve tenant + activo desde la
 *     clave; el body sólo lleva la telemetría.
 *  2. Token compartido (gateways/intermediarios de confianza: Traccar, LNS,
 *     bridge MQTT): header `X-Ingest-Token` + `tenantId` en el body.
 *
 * Body: { tenantId?, deviceIdentifier?, assetId?, lat, lng, battery?, engineHours?, ts?, raw? }
 */
export async function registerTelemetryRoutes(app: FastifyInstance) {
  app.post('/telemetry/ingest', async (req, reply) => {
    const b = (req.body ?? {}) as Record<string, any>;
    const deviceKey = req.headers['x-device-key'] as string | undefined;

    // --- Modo 1: credencial por dispositivo ---
    if (deviceKey) {
      const k = await pool.query(
        'SELECT device_id, tenant_id FROM device_keys WHERE key_hash = $1 LIMIT 1',
        [hashKey(deviceKey)],
      );
      if (k.rowCount === 0) return reply.code(401).send({ error: 'clave de dispositivo inválida' });
      const { device_id, tenant_id } = k.rows[0];
      await withTenant(tenant_id, (c) => ingestPoint(c, {
        deviceId: device_id,
        lat: b.lat, lng: b.lng, battery: b.battery, engineHours: b.engineHours,
        ts: b.ts, raw: b.raw,
      }));
      return reply.code(202).send({ accepted: true });
    }

    // --- Modo 2: token compartido + tenantId ---
    if (req.headers['x-ingest-token'] !== config.ingestToken) {
      return reply.code(401).send({ error: 'autenticación de ingesta inválida' });
    }
    if (!b.tenantId) return reply.code(400).send({ error: 'tenantId requerido' });

    await withTenant(b.tenantId, (c) => ingestPoint(c, {
      deviceIdentifier: b.deviceIdentifier,
      assetId: b.assetId,
      lat: b.lat,
      lng: b.lng,
      battery: b.battery,
      engineHours: b.engineHours,
      ts: b.ts,
      raw: b.raw,
    }));
    return reply.code(202).send({ accepted: true });
  });
}
