import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db.js';

export async function registerGeofenceRoutes(app: FastifyInstance) {
  // Listar geocercas como GeoJSON.
  app.get('/geofences', { preHandler: [app.authenticate] }, async (req) => {
    return withTenant(req.user.tenant, async (c) => {
      const r = await c.query(
        `SELECT id, name, location_id,
                ST_AsGeoJSON(polygon)::json AS geometry, created_at
           FROM geofences ORDER BY created_at DESC`,
      );
      return { geofences: r.rows };
    });
  });

  // Crear geocerca. Acepta un anillo de puntos [[lng,lat],...] (polígono simple)
  // o un círculo { center:[lng,lat], radiusM }.
  app.post('/geofences', { preHandler: [app.authenticate] }, async (req, reply) => {
    const b = (req.body ?? {}) as Record<string, any>;
    if (!b.name) return reply.code(400).send({ error: 'name requerido' });

    return withTenant(req.user.tenant, async (c) => {
      if (Array.isArray(b.center) && b.radiusM) {
        // Círculo → polígono buffer en metros (geography).
        const r = await c.query(
          `INSERT INTO geofences (tenant_id, name, polygon)
           VALUES (current_tenant(), $1,
             ST_SetSRID(
               ST_Buffer(ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, $4)::geometry,
               4326))
           RETURNING id, name, ST_AsGeoJSON(polygon)::json AS geometry`,
          [b.name, Number(b.center[0]), Number(b.center[1]), Number(b.radiusM)],
        );
        return reply.code(201).send({ geofence: r.rows[0] });
      }

      const points: [number, number][] = b.points;
      if (!Array.isArray(points) || points.length < 3) {
        return reply.code(400).send({ error: 'points (>=3) o center+radiusM requeridos' });
      }
      // Cerrar el anillo si hace falta.
      const ring = [...points];
      const [fx, fy] = ring[0];
      const [lx, ly] = ring[ring.length - 1];
      if (fx !== lx || fy !== ly) ring.push([fx, fy]);
      const geojson = JSON.stringify({ type: 'Polygon', coordinates: [ring] });

      const r = await c.query(
        `INSERT INTO geofences (tenant_id, name, polygon)
         VALUES (current_tenant(), $1, ST_SetSRID(ST_GeomFromGeoJSON($2), 4326))
         RETURNING id, name, ST_AsGeoJSON(polygon)::json AS geometry`,
        [b.name, geojson],
      );
      return reply.code(201).send({ geofence: r.rows[0] });
    });
  });

  // Alertas (abiertas primero).
  app.get('/alerts', { preHandler: [app.authenticate] }, async (req) => {
    return withTenant(req.user.tenant, async (c) => {
      const r = await c.query(
        `SELECT a.id, a.kind, a.severity, a.message, a.created_at, a.resolved_at,
                ast.name AS asset_name
           FROM alerts a
           LEFT JOIN assets ast ON ast.id = a.asset_id
          ORDER BY (a.resolved_at IS NULL) DESC, a.created_at DESC
          LIMIT 100`,
      );
      return { alerts: r.rows };
    });
  });
}
