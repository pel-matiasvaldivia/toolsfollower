import type { TelemetryPoint } from './ingest.js';

export interface MqttMessage {
  tenantId: string;
  point: TelemetryPoint;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Normaliza un mensaje MQTT en un punto de telemetría para `ingestPoint`.
 *
 * Convención de topic: `<prefix>/<tenantId>/<deviceIdentifier>` (p. ej.
 * `trazza/<uuid>/<imei>`), con payload JSON `{ lat, lng, battery, engineHours, ts }`.
 * El `tenantId` y el `deviceIdentifier` también pueden venir dentro del payload
 * (topic genérico `<prefix>/ingest`); el payload tiene prioridad sobre el topic.
 *
 * Devuelve null si el payload no es JSON, falta un tenantId válido (uuid), o no
 * hay forma de resolver el activo (ni deviceIdentifier ni assetId).
 */
export function parseMqtt(topic: string, raw: Buffer | string, prefix = 'trazza'): MqttMessage | null {
  let body: any;
  try {
    body = JSON.parse(raw.toString());
  } catch {
    return null;
  }
  if (!body || typeof body !== 'object') return null;

  const parts = topic.split('/').filter(Boolean);
  let tenantId: string | null = null;
  let deviceIdentifier: string | null = null;
  if (parts.length >= 3 && parts[0] === prefix) {
    tenantId = parts[1];
    deviceIdentifier = parts[2];
  }
  tenantId = (body.tenantId ?? tenantId) || null;
  deviceIdentifier = (body.deviceIdentifier ?? deviceIdentifier) || null;

  if (!tenantId || !UUID_RE.test(tenantId)) return null;
  const assetId = body.assetId ?? null;
  if (!deviceIdentifier && !assetId) return null;

  const point: TelemetryPoint = {
    deviceIdentifier,
    assetId,
    lat: num(body.lat ?? body.latitude),
    lng: num(body.lng ?? body.longitude),
    battery: num(body.battery),
    engineHours: num(body.engineHours),
    ts: body.ts ?? null,
    raw: body,
  };
  return { tenantId, point };
}
