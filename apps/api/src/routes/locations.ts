import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db.js';

const KINDS = ['depot', 'site']; // depósito | obra

/**
 * Depósitos y obras (locations). Son el punto de partida natural: primero se
 * crean, y luego las herramientas se asignan a uno de ellos.
 */
export async function registerLocationRoutes(app: FastifyInstance) {
  app.get('/locations', { preHandler: [app.authenticate] }, async (req) => {
    return withTenant(req.user.tenant, async (c) => {
      const r = await c.query(
        `SELECT id, name, kind,
                ST_X(geom) AS lng, ST_Y(geom) AS lat, created_at,
                (SELECT COUNT(*)::int FROM assets a WHERE a.location_id = l.id) AS asset_count
           FROM locations l
          ORDER BY created_at DESC
          LIMIT 500`,
      );
      return { locations: r.rows };
    });
  });

  app.post('/locations', { preHandler: [app.authenticate] }, async (req, reply) => {
    const b = (req.body ?? {}) as Record<string, any>;
    const name = typeof b.name === 'string' ? b.name.trim() : '';
    const kind = KINDS.includes(b.kind) ? b.kind : 'depot';
    if (!name) return reply.code(400).send({ error: 'name requerido' });
    const lat = b.lat != null ? Number(b.lat) : null;
    const lng = b.lng != null ? Number(b.lng) : null;
    return withTenant(req.user.tenant, async (c) => {
      const r = await c.query(
        `INSERT INTO locations (tenant_id, name, kind, geom)
         VALUES (current_tenant(), $1, $2,
                 CASE WHEN $3::float8 IS NULL THEN NULL
                      ELSE ST_SetSRID(ST_MakePoint($4, $3), 4326) END)
         RETURNING id, name, kind, ST_X(geom) AS lng, ST_Y(geom) AS lat, created_at`,
        [name, kind, lat, lng],
      );
      return reply.code(201).send({ location: r.rows[0] });
    });
  });

  app.patch('/locations/:id', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const b = (req.body ?? {}) as Record<string, any>;
    const lat = b.lat != null ? Number(b.lat) : null;
    const lng = b.lng != null ? Number(b.lng) : null;
    return withTenant(req.user.tenant, async (c) => {
      const r = await c.query(
        `UPDATE locations
            SET name = COALESCE($2, name),
                kind = COALESCE($3, kind),
                geom = CASE WHEN $4::float8 IS NULL THEN geom
                            ELSE ST_SetSRID(ST_MakePoint($5, $4), 4326) END
          WHERE id = $1
          RETURNING id, name, kind, ST_X(geom) AS lng, ST_Y(geom) AS lat, created_at`,
        [id, b.name ?? null, KINDS.includes(b.kind) ? b.kind : null, lat, lng],
      );
      if (r.rowCount === 0) return reply.code(404).send({ error: 'depósito no encontrado' });
      return { location: r.rows[0] };
    });
  });

  app.delete('/locations/:id', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    return withTenant(req.user.tenant, async (c) => {
      const r = await c.query('DELETE FROM locations WHERE id = $1', [id]);
      if (r.rowCount === 0) return reply.code(404).send({ error: 'depósito no encontrado' });
      return reply.code(204).send();
    });
  });
}
