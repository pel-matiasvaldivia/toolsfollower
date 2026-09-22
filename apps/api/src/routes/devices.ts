import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db.js';

const KINDS = ['gps', 'lora', 'rfid'];

/**
 * Alta y vinculación de dispositivos físicos (GPS/4G, LoRaWAN, RFID) con los
 * activos. El `identifier` es el IMEI (GPS), DevEUI (LoRa) o EPC (RFID); es lo
 * que la ingesta usa para resolver a qué activo pertenece cada dato.
 */
export async function registerDeviceRoutes(app: FastifyInstance) {
  // Listar dispositivos del tenant, con el activo vinculado (si hay).
  app.get('/devices', { preHandler: [app.authenticate] }, async (req) => {
    return withTenant(req.user.tenant, async (c) => {
      const r = await c.query(
        `SELECT d.id, d.kind, d.identifier, d.asset_id, d.created_at,
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
  app.post('/devices', { preHandler: [app.authenticate] }, async (req, reply) => {
    const b = (req.body ?? {}) as Record<string, any>;
    const kind = KINDS.includes(b.kind) ? b.kind : null;
    const identifier = typeof b.identifier === 'string' ? b.identifier.trim() : '';
    if (!kind) return reply.code(400).send({ error: 'kind inválido (gps | lora | rfid)' });
    if (!identifier) return reply.code(400).send({ error: 'identifier requerido (IMEI/DevEUI/EPC)' });

    return withTenant(req.user.tenant, async (c) => {
      try {
        const r = await c.query(
          `INSERT INTO devices (tenant_id, kind, identifier, asset_id)
           VALUES (current_tenant(), $1, $2, $3)
           RETURNING id, kind, identifier, asset_id, created_at`,
          [kind, identifier, b.assetId ?? null],
        );
        return reply.code(201).send({ device: r.rows[0] });
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

  // Vincular / desvincular el dispositivo de un activo (assetId null = desvincular).
  app.patch('/devices/:id', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const b = (req.body ?? {}) as Record<string, any>;
    return withTenant(req.user.tenant, async (c) => {
      try {
        const r = await c.query(
          `UPDATE devices SET asset_id = $2 WHERE id = $1
           RETURNING id, kind, identifier, asset_id, created_at`,
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

  // Baja de un dispositivo.
  app.delete('/devices/:id', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    return withTenant(req.user.tenant, async (c) => {
      const r = await c.query('DELETE FROM devices WHERE id = $1', [id]);
      if (r.rowCount === 0) return reply.code(404).send({ error: 'dispositivo no encontrado' });
      return reply.code(204).send();
    });
  });
}
