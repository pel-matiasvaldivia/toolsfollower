import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { withTenant } from '../db.js';
import { evaluateGeofence } from '../services/geofence.js';
import { evaluateMaintenance } from '../services/maintenance.js';
import { presignGet, presignPut, extForContentType } from '../services/storage.js';

export async function registerAssetRoutes(app: FastifyInstance) {
  // Listar activos del tenant (RLS filtra automáticamente).
  app.get('/assets', { preHandler: [app.authenticate] }, async (req) => {
    return withTenant(req.user.tenant, async (c) => {
      const r = await c.query(
        `SELECT id, name, serial, tier, value_usd, status, last_battery, last_seen_at,
                ST_X(last_geom) AS last_lng, ST_Y(last_geom) AS last_lat, photo_url AS photo_key, created_at
           FROM assets
          ORDER BY created_at DESC
          LIMIT 500`,
      );
      // photo_url en la respuesta es una URL prefirmada de descarga (o null).
      const assets = await Promise.all(r.rows.map(async (row: any) => {
        const { photo_key, ...rest } = row;
        let photo_url: string | null = null;
        if (photo_key) photo_url = await presignGet(photo_key).catch(() => null);
        return { ...rest, photo_url };
      }));
      return { assets };
    });
  });

  // Solicitar una URL prefirmada para SUBIR la foto de un activo.
  app.post('/assets/:id/photo-upload', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const b = (req.body ?? {}) as Record<string, any>;
    return withTenant(req.user.tenant, async (c) => {
      const a = await c.query('SELECT id FROM assets WHERE id = $1', [id]);
      if (a.rowCount === 0) return reply.code(404).send({ error: 'activo no encontrado' });
      const key = `t/${req.user.tenant}/a/${id}/${randomUUID()}${extForContentType(b.contentType)}`;
      const uploadUrl = await presignPut(key);
      return { uploadUrl, key };
    });
  });

  // Confirmar la foto subida: guarda la key en el activo (valida el prefijo).
  app.put('/assets/:id/photo', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const b = (req.body ?? {}) as Record<string, any>;
    const key = typeof b.key === 'string' ? b.key : '';
    const prefix = `t/${req.user.tenant}/a/${id}/`;
    if (!key.startsWith(prefix)) return reply.code(400).send({ error: 'key inválida' });
    return withTenant(req.user.tenant, async (c) => {
      const u = await c.query('UPDATE assets SET photo_url = $2 WHERE id = $1 RETURNING id', [id, key]);
      if (u.rowCount === 0) return reply.code(404).send({ error: 'activo no encontrado' });
      const photo_url = await presignGet(key).catch(() => null);
      return { ok: true, photo_url };
    });
  });

  // Crear activo.
  app.post('/assets', { preHandler: [app.authenticate] }, async (req, reply) => {
    const b = (req.body ?? {}) as Record<string, any>;
    if (!b.name) return reply.code(400).send({ error: 'name requerido' });
    const tier = ['gps', 'lora', 'rfid'].includes(b.tier) ? b.tier : 'rfid';
    return withTenant(req.user.tenant, async (c) => {
      const r = await c.query(
        `INSERT INTO assets (tenant_id, name, serial, tier, value_usd)
         VALUES (current_tenant(), $1, $2, $3, $4)
         RETURNING id, name, serial, tier, value_usd, status, created_at`,
        [b.name, b.serial ?? null, tier, b.value_usd ?? null],
      );
      return reply.code(201).send({ asset: r.rows[0] });
    });
  });

  // Actualizar posición del activo (autenticado). Útil para carga manual y demo;
  // dispara la evaluación de geocercas.
  app.post('/assets/:id/position', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const b = (req.body ?? {}) as Record<string, any>;
    const lat = b.lat != null ? Number(b.lat) : null;
    const lng = b.lng != null ? Number(b.lng) : null;
    if (lat == null || lng == null) return reply.code(400).send({ error: 'lat y lng requeridos' });

    return withTenant(req.user.tenant, async (c) => {
      const u = await c.query(
        `UPDATE assets
            SET last_geom = ST_SetSRID(ST_MakePoint($2, $3), 4326),
                last_battery = COALESCE($4, last_battery),
                last_engine_hours = COALESCE($5, last_engine_hours),
                last_seen_at = now()
          WHERE id = $1
          RETURNING id`,
        [id, lng, lat, b.battery ?? null, b.engineHours ?? null],
      );
      if (u.rowCount === 0) return reply.code(404).send({ error: 'activo no encontrado' });

      await c.query(
        `INSERT INTO telemetry (tenant_id, asset_id, geom, battery, engine_hours)
         VALUES (current_tenant(), $1, ST_SetSRID(ST_MakePoint($2, $3), 4326), $4, $5)`,
        [id, lng, lat, b.battery ?? null, b.engineHours ?? null],
      );
      await evaluateGeofence(c, id, lng, lat);
      await evaluateMaintenance(c, id);
      return reply.code(202).send({ accepted: true });
    });
  });

  // Resumen para el dashboard.
  app.get('/summary', { preHandler: [app.authenticate] }, async (req) => {
    return withTenant(req.user.tenant, async (c) => {
      const r = await c.query(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE tier = 'gps')::int  AS gps,
           COUNT(*) FILTER (WHERE tier = 'lora')::int AS lora,
           COUNT(*) FILTER (WHERE tier = 'rfid')::int AS rfid,
           COALESCE(SUM(value_usd), 0)::float AS value_usd
         FROM assets`,
      );
      const a = await c.query(
        `SELECT COUNT(*)::int AS open_alerts FROM alerts WHERE resolved_at IS NULL`,
      );
      return { ...r.rows[0], open_alerts: a.rows[0].open_alerts };
    });
  });
}
