import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db.js';

export async function registerMaintenanceRoutes(app: FastifyInstance) {
  // Listar planes con estado calculado (ok | due_soon | overdue).
  app.get('/maintenance/plans', { preHandler: [app.authenticate] }, async (req) => {
    return withTenant(req.user.tenant, async (c) => {
      const r = await c.query(
        `SELECT p.id, p.strategy, p.interval_days, p.interval_hours,
                p.next_due_at, p.next_due_hours,
                a.id AS asset_id, a.name AS asset_name, a.last_engine_hours,
                CASE
                  WHEN p.strategy = 'hours' AND a.last_engine_hours >= p.next_due_hours THEN 'overdue'
                  WHEN p.strategy = 'hours' AND a.last_engine_hours >= p.next_due_hours - COALESCE(p.interval_hours,0) * 0.1 THEN 'due_soon'
                  WHEN p.strategy = 'calendar' AND now() >= p.next_due_at THEN 'overdue'
                  WHEN p.strategy = 'calendar' AND now() >= p.next_due_at - INTERVAL '7 days' THEN 'due_soon'
                  ELSE 'ok'
                END AS status
           FROM maintenance_plans p
           JOIN assets a ON a.id = p.asset_id
          ORDER BY p.created_at DESC`,
      );
      return { plans: r.rows };
    });
  });

  // Crear plan. Body: { assetId, strategy, intervalDays?, intervalHours? }
  app.post('/maintenance/plans', { preHandler: [app.authenticate] }, async (req, reply) => {
    const b = (req.body ?? {}) as Record<string, any>;
    if (!b.assetId) return reply.code(400).send({ error: 'assetId requerido' });
    const strategy = b.strategy === 'hours' ? 'hours' : 'calendar';

    return withTenant(req.user.tenant, async (c) => {
      if (strategy === 'hours') {
        const interval = Number(b.intervalHours);
        if (!interval || interval <= 0) return reply.code(400).send({ error: 'intervalHours requerido' });
        // Próximo due = horas actuales del activo + intervalo.
        const a = await c.query('SELECT COALESCE(last_engine_hours, 0) AS h FROM assets WHERE id = $1', [b.assetId]);
        if (a.rowCount === 0) return reply.code(404).send({ error: 'activo no encontrado' });
        const nextHours = Number(a.rows[0].h) + interval;
        const r = await c.query(
          `INSERT INTO maintenance_plans (tenant_id, asset_id, strategy, interval_hours, next_due_hours)
           VALUES (current_tenant(), $1, 'hours', $2, $3)
           RETURNING id, strategy, interval_hours, next_due_hours`,
          [b.assetId, interval, nextHours],
        );
        return reply.code(201).send({ plan: r.rows[0] });
      }

      const days = Number(b.intervalDays);
      if (!days || days <= 0) return reply.code(400).send({ error: 'intervalDays requerido' });
      const r = await c.query(
        `INSERT INTO maintenance_plans (tenant_id, asset_id, strategy, interval_days, next_due_at)
         VALUES (current_tenant(), $1, 'calendar', $2, now() + ($2 || ' days')::interval)
         RETURNING id, strategy, interval_days, next_due_at`,
        [b.assetId, days],
      );
      return reply.code(201).send({ plan: r.rows[0] });
    });
  });

  // Registrar service realizado: crea evento, avanza el próximo vencimiento y
  // resuelve la alerta de mantenimiento del activo.
  app.post('/maintenance/plans/:id/complete', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const b = (req.body ?? {}) as Record<string, any>;

    return withTenant(req.user.tenant, async (c) => {
      const p = await c.query(
        `SELECT p.*, a.last_engine_hours
           FROM maintenance_plans p JOIN assets a ON a.id = p.asset_id
          WHERE p.id = $1`,
        [id],
      );
      if (p.rowCount === 0) return reply.code(404).send({ error: 'plan no encontrado' });
      const plan = p.rows[0];

      await c.query(
        `INSERT INTO maintenance_events (tenant_id, asset_id, plan_id, notes)
         VALUES (current_tenant(), $1, $2, $3)`,
        [plan.asset_id, id, b.notes ?? null],
      );

      if (plan.strategy === 'hours') {
        const base = Number(plan.last_engine_hours ?? 0);
        await c.query('UPDATE maintenance_plans SET next_due_hours = $2 WHERE id = $1',
          [id, base + Number(plan.interval_hours ?? 0)]);
      } else {
        await c.query(
          `UPDATE maintenance_plans SET next_due_at = now() + (interval_days || ' days')::interval WHERE id = $1`,
          [id]);
      }

      await c.query(
        `UPDATE alerts SET resolved_at = now()
          WHERE asset_id = $1 AND kind = 'maintenance_due' AND resolved_at IS NULL`,
        [plan.asset_id]);

      return { completed: true };
    });
  });
}
