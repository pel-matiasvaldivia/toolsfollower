import mqtt from 'mqtt';
import { config } from './config.js';
import { withTenant } from './db.js';
import { ingestPoint } from './services/ingest.js';
import { parseMqtt } from './services/mqtt.js';

/**
 * Bridge MQTT -> ingesta. Proceso independiente (contenedor `bridge`) que se
 * suscribe al broker Mosquitto y normaliza cada mensaje al modelo de Trazza,
 * reutilizando `ingestPoint` (misma evaluación de geocercas y mantenimiento).
 *
 * Corre en UNA sola instancia (no escalar) para no procesar cada mensaje N veces.
 */
const prefix = config.mqttTopicPrefix;
const topic = `${prefix}/#`;

const client = mqtt.connect(config.mqttUrl, {
  reconnectPeriod: 3000,
  clientId: `trazza-bridge-${process.pid}`,
});

client.on('connect', () => {
  console.log(`[bridge] conectado a ${config.mqttUrl}`);
  client.subscribe(topic, { qos: 1 }, (err) => {
    if (err) console.error('[bridge] error al suscribir:', err.message);
    else console.log(`[bridge] suscripto a ${topic}`);
  });
});

client.on('message', async (t, payload) => {
  const msg = parseMqtt(t, payload, prefix);
  if (!msg) return; // payload no-JSON, sin tenant válido o sin forma de resolver activo.
  try {
    await withTenant(msg.tenantId, (c) => ingestPoint(c, msg.point));
  } catch (err) {
    console.error(`[bridge] fallo al ingestar (${t}):`, (err as Error).message);
  }
});

client.on('error', (err) => console.error('[bridge] error MQTT:', err.message));
client.on('reconnect', () => console.log('[bridge] reconectando…'));

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => client.end(true, {}, () => process.exit(0)));
}
