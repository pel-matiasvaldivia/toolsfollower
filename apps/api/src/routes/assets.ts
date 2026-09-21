import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db.js';

export async function registerAssetRoutes(app: FastifyInstance) {
  // Listar activos del tenant (RLS filtra automáticamente).
  app.get('/assets', { preHandler: [app.authenticate] }, async (req) => {
    return withTenant(req.user.tenant, async (c) => {
      const r = await c.query(
        `SELECT id, name, serial, tier, value_usd, status, last_battery, last_seen_at,
                ST_X(last_geom) AS last_lng, ST_Y(last_geom) AS last_lat, created_at
           FROM assets
          ORDER BY created_at DESC
          LIMIT 500`,
      );
      return { assets: r.rows };
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
