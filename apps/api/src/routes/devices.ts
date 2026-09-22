import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db.js';
import { generateDeviceKey } from '../util/apikey.js';

const KINDS = ['gps', 'lora', 'rfid'];

/**
 * Alta y vinculación de dispositivos físicos (GPS/4G, LoRaWAN, RFID) con los
 * activos. El `identifier` es el IMEI (GPS), DevEUI (LoRa) o EPC (RFID).
 *
 * Cada dispositivo recibe una credencial propia (clave `trz_…`) que se muestra
 * UNA sola vez al crearse o rotarse. La ingesta HTTP directa autentica con esa
 * clave (header `X-Device-Key`) y resuelve tenant + activo sin mandar tenantId.
 */
export async function registerDeviceRoutes(app: FastifyInstance) {
  // Listar dispositivos del tenant, con el activo vinculado (si hay).
  app.get('/devices', { preHandler: [app.authenticate] }, async (req) => {
    return withTenant(req.user.tenant, async (c) => {
      const r = await c.query(
        `SELECT d.id, d.kind, d.identifier, d.asset_id, d.key_prefix, d.created_at,
                a.name AS asset_name
           FROM devices d
           LEFT JOIN assets a ON a.id = d.asset_id
          ORDER BY d.created_at DESC
          LIMIT 500`,
      );
      return { devices: r.rows };
    });
  });

  // Registrar (dar de alta) un dispositivo y opcionalmente vincularlo a un activo.
  // Devuelve la credencial en claro una única vez.
  app.post('/devices', { preHandler: [app.authenticate] }, async (req, reply) => {
    const b = (req.body ?? {}) as Record<string, any>;
    const kind = KINDS.includes(b.kind) ? b.kind : null;
    let identifier = typeof b.identifier === 'string' ? b.identifier.trim() : '';
    if (!kind) return reply.code(400).send({ error: 'kind inválido (gps | lora | rfid)' });
    if (!identifier) return reply.code(400).send({ error: 'identifier requerido (IMEI/DevEUI/EPC)' });
    // El DevEUI de LoRaWAN se guarda en minúscula (así lo emiten ChirpStack/TTS).
    if (kind === 'lora') identifier = identifier.toLowerCase();

    const cred = generateDeviceKey();

    return withTenant(req.user.tenant, async (c) => {
      try {
        const r = await c.query(
          `INSERT INTO devices (tenant_id, kind, identifier, asset_id, key_prefix)
           VALUES (current_tenant(), $1, $2, $3, $4)
           RETURNING id, kind, identifier, asset_id, key_prefix, created_at`,
          [kind, identifier, b.assetId ?? null, cred.prefix],
        );
        const device = r.rows[0];
        await c.query(
          `INSERT INTO device_keys (key_hash, device_id, tenant_id)
           VALUES ($1, $2, current_tenant())`,
          [cred.hash, device.id],
        );
        // La clave se devuelve una única vez; no se puede recuperar después.
        return reply.code(201).send({ device, key: cred.key });
      } catch (err: any) {
        if (err?.code === '23505') {
          return reply.code(409).send({ error: 'ya existe un dispositivo con ese identificador' });
        }
        if (err?.code === '23503') {
          return reply.code(400).send({ error: 'assetId inválido' });
        }
        throw err;
      }
    });
  });

  // Rotar la credencial de un dispositivo. Invalida la anterior y devuelve la
  // nueva una única vez.
  app.post('/devices/:id/rotate-key', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const cred = generateDeviceKey();
    return withTenant(req.user.tenant, async (c) => {
      const u = await c.query(
        `UPDATE devices SET key_prefix = $2 WHERE id = $1 RETURNING id`,
        [id, cred.prefix],
      );
      if (u.rowCount === 0) return reply.code(404).send({ error: 'dispositivo no encontrado' });
      // Reemplazar la clave: borrar la/s anterior/es e insertar la nueva.
      await c.query('DELETE FROM device_keys WHERE device_id = $1', [id]);
      await c.query(
        `INSERT INTO device_keys (key_hash, device_id, tenant_id)
         VALUES ($1, $2, current_tenant())`,
        [cred.hash, id],
      );
      return { deviceId: id, key: cred.key };
    });
  });

  // Vincular / desvincular el dispositivo de un activo (assetId null = desvincular).
  app.patch('/devices/:id', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const b = (req.body ?? {}) as Record<string, any>;
    return withTenant(req.user.tenant, async (c) => {
      try {
        const r = await c.query(
          `UPDATE devices SET asset_id = $2 WHERE id = $1
           RETURNING id, kind, identifier, asset_id, key_prefix, created_at`,
          [id, b.assetId ?? null],
        );
        if (r.rowCount === 0) return reply.code(404).send({ error: 'dispositivo no encontrado' });
        return { device: r.rows[0] };
      } catch (err: any) {
        if (err?.code === '23503') return reply.code(400).send({ error: 'assetId inválido' });
        throw err;
      }
    });
  });

  // Baja de un dispositivo (device_keys cae por ON DELETE CASCADE).
  app.delete('/devices/:id', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    return withTenant(req.user.tenant, async (c) => {
      const r = await c.query('DELETE FROM devices WHERE id = $1', [id]);
      if (r.rowCount === 0) return reply.code(404).send({ error: 'dispositivo no encontrado' });
      return reply.code(204).send();
    });
  });
}
