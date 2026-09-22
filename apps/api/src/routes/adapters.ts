import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db.js';
import { config } from '../config.js';
import { ingestPoint, type TelemetryPoint } from '../services/ingest.js';

/**
 * Adapters de dispositivos: reciben el formato nativo de una plataforma de
 * tracking y lo normalizan al modelo de Trazza (via `ingestPoint`).
 *
 * Traccar (open-source) se pone delante de los trackers GPS/4G que hablan
 * protocolos binarios (Teltonika, Queclink, Concox...). Se configura su
 * "position forwarding" en modo JSON apuntando a:
 *
 *   https://<host>/api/adapters/traccar?tenantId=<uuid>&token=<INGEST_TOKEN>
 *
 * El `device.uniqueId` de Traccar (el IMEI) se usa como `deviceIdentifier`
 * para resolver el activo. `attributes.hours` de Traccar viene en milisegundos.
 */

/** Convierte un payload de forwarding de Traccar en un punto de telemetría. */
export function parseTraccar(body: any): TelemetryPoint | null {
  const pos = body?.position;
  const dev = body?.device;
  if (!pos || typeof pos.latitude !== 'number' || typeof pos.longitude !== 'number') {
    return null;
  }
  const attrs = pos.attributes ?? {};

  // Batería: Traccar reporta batteryLevel en % (0-100).
  const battery = typeof attrs.batteryLevel === 'number' ? Math.round(attrs.batteryLevel) : null;

  // Horas de motor: Traccar acumula `hours` en milisegundos.
  const engineHours = typeof attrs.hours === 'number'
    ? Math.round((attrs.hours / 3_600_000) * 10) / 10
    : null;

  const identifier = dev?.uniqueId != null ? String(dev.uniqueId) : null;
  const ts = pos.fixTime ?? pos.deviceTime ?? pos.serverTime ?? null;

  return {
    deviceIdentifier: identifier,
    lat: pos.latitude,
    lng: pos.longitude,
    battery,
    engineHours,
    ts,
    raw: body,
  };
}

export async function registerAdapterRoutes(app: FastifyInstance) {
  app.post('/adapters/traccar', async (req, reply) => {
    const q = (req.query ?? {}) as Record<string, string>;
    const token = (req.headers['x-ingest-token'] as string) ?? q.token;
    if (token !== config.ingestToken) {
      return reply.code(401).send({ error: 'token de ingesta inválido' });
    }
    const tenantId = q.tenantId ?? (req.body as any)?.tenantId;
    if (!tenantId) return reply.code(400).send({ error: 'tenantId requerido (query ?tenantId=)' });

    const point = parseTraccar(req.body);
    if (!point) return reply.code(422).send({ error: 'payload de Traccar sin posición válida' });

    const res = await withTenant(tenantId, (c) => ingestPoint(c, point));
    // Traccar considera exitoso cualquier 2xx; devolvemos si se resolvió el activo.
    return reply.code(202).send({ accepted: true, resolved: res.resolved });
  });
}
