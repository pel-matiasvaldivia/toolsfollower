import type { FastifyInstance, FastifyRequest } from 'fastify';
import { withTenant } from '../db.js';
import { config } from '../config.js';
import { ingestPoint, type TelemetryPoint } from '../services/ingest.js';

/**
 * Adapters de dispositivos: reciben el formato nativo de una plataforma de
 * tracking y lo normalizan al modelo de Trazza (via `ingestPoint`).
 *
 * - Traccar: trackers GPS/4G que hablan protocolos binarios (Teltonika,
 *   Queclink, Concox...). "Position forwarding" JSON.
 * - LoRaWAN: el LNS (ChirpStack v4 o The Things Stack v3) reenvía los uplinks
 *   por HTTP. El payload decodificado (codec del dispositivo) trae lat/lng.
 *
 *   https://<host>/api/adapters/<traccar|lorawan>?tenantId=<uuid>
 *   header X-Ingest-Token: <INGEST_TOKEN>   (o ?token= en la query)
 */

/** Devuelve el primer valor presente entre varias claves candidatas. */
function pick(obj: any, keys: string[]): unknown {
  for (const k of keys) {
    if (obj != null && obj[k] != null) return obj[k];
  }
  return null;
}
/** Convierte a número finito o null. */
function num(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Valida el token de ingesta (header o query) y resuelve el tenantId. */
function authAdapter(req: FastifyRequest): { ok: boolean; tenantId?: string } {
  const q = (req.query ?? {}) as Record<string, string>;
  const token = (req.headers['x-ingest-token'] as string) ?? q.token;
  if (token !== config.ingestToken) return { ok: false };
  const tenantId = q.tenantId ?? (req.body as any)?.tenantId;
  return { ok: true, tenantId };
}

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

/**
 * Convierte un uplink de LoRaWAN (ChirpStack v4 o The Things Stack v3) en un
 * punto de telemetría. Devuelve null si no hay posición decodificada (p. ej.
 * eventos de join o uplinks sin GPS), para que el LNS no reintente.
 * El DevEUI se normaliza a minúscula (así lo emiten ambos LNS).
 */
export function parseLoraWan(body: any): TelemetryPoint | null {
  if (!body || typeof body !== 'object') return null;

  let devEui: unknown = null;
  let obj: any = null;
  let ts: string | null = null;

  if (body.uplink_message) {
    // The Things Stack v3
    devEui = body.end_device_ids?.dev_eui ?? null;
    obj = body.uplink_message.decoded_payload ?? null;
    ts = body.received_at ?? body.uplink_message.received_at ?? null;
  } else if (body.deviceInfo || body.object) {
    // ChirpStack v4
    devEui = body.deviceInfo?.devEui ?? null;
    obj = body.object ?? null;
    ts = body.time ?? null;
  } else {
    return null;
  }
  if (!obj || typeof obj !== 'object') return null;

  const lat = num(pick(obj, ['latitude', 'lat', 'gps_lat', 'gpsLat', 'gnss_lat']));
  const lng = num(pick(obj, ['longitude', 'lng', 'lon', 'long', 'gps_lng', 'gps_lon', 'gpsLng', 'gnss_lng']));
  if (lat == null || lng == null) return null;

  const battery = num(pick(obj, ['battery', 'batteryLevel', 'battery_level', 'bat']));
  const engineHours = num(pick(obj, ['engineHours', 'hours']));

  return {
    deviceIdentifier: devEui != null ? String(devEui).toLowerCase() : null,
    lat,
    lng,
    battery: battery != null ? Math.round(battery) : null,
    engineHours,
    ts,
    raw: body,
  };
}

export async function registerAdapterRoutes(app: FastifyInstance) {
  // Traccar (GPS/4G).
  app.post('/adapters/traccar', async (req, reply) => {
    const a = authAdapter(req);
    if (!a.ok) return reply.code(401).send({ error: 'token de ingesta inválido' });
    if (!a.tenantId) return reply.code(400).send({ error: 'tenantId requerido (query ?tenantId=)' });

    const point = parseTraccar(req.body);
    if (!point) return reply.code(422).send({ error: 'payload de Traccar sin posición válida' });

    const res = await withTenant(a.tenantId, (c) => ingestPoint(c, point));
    // Traccar considera exitoso cualquier 2xx; devolvemos si se resolvió el activo.
    return reply.code(202).send({ accepted: true, resolved: res.resolved });
  });

  // LoRaWAN (ChirpStack / The Things Stack).
  app.post('/adapters/lorawan', async (req, reply) => {
    const a = authAdapter(req);
    if (!a.ok) return reply.code(401).send({ error: 'token de ingesta inválido' });
    if (!a.tenantId) return reply.code(400).send({ error: 'tenantId requerido (query ?tenantId=)' });

    const point = parseLoraWan(req.body);
    // Sin posición (join, status, uplink sin GPS): 2xx para no forzar reintentos del LNS.
    if (!point) return reply.code(202).send({ accepted: true, ignored: true });

    const res = await withTenant(a.tenantId, (c) => ingestPoint(c, point));
    return reply.code(202).send({ accepted: true, resolved: res.resolved });
  });
}
