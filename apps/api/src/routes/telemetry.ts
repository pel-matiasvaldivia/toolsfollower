import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db.js';
import { config } from '../config.js';
import { ingestPoint } from '../services/ingest.js';

/**
 * Ingesta de telemetría de dispositivos (webhook HTTP; el broker MQTT puede
 * reenviar acá vía un bridge). Autenticación por token compartido para el MVP;
 * en producción, credenciales/cert por dispositivo.
 *
 * Body: { tenantId, deviceIdentifier?, assetId?, lat, lng, battery?, engineHours?, ts?, raw? }
 */
export async function registerTelemetryRoutes(app: FastifyInstance) {
  app.post('/telemetry/ingest', async (req, reply) => {
    if (req.headers['x-ingest-token'] !== config.ingestToken) {
      return reply.code(401).send({ error: 'token de ingesta inválido' });
    }
    const b = (req.body ?? {}) as Record<string, any>;
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
