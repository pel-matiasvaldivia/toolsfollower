import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db.js';

const SEVERITIES = ['info', 'warning', 'critical'];

/**
 * Configuración de notificaciones por tenant: destinatarios de email/WhatsApp,
 * severidad mínima y on/off. El envío lo hace el worker `notifier` a partir de
 * la cola `notification_outbox`.
 */
export async function registerNotificationRoutes(app: FastifyInstance) {
  app.get('/notifications/settings', { preHandler: [app.authenticate] }, async (req) => {
    return withTenant(req.user.tenant, async (c) => {
      const r = await c.query(
        `SELECT enabled, emails, whatsapp, min_severity, updated_at
           FROM notification_settings WHERE tenant_id = current_tenant()`,
      );
      return { settings: r.rows[0] ?? { enabled: true, emails: '', whatsapp: '', min_severity: 'warning' } };
    });
  });

  app.put('/notifications/settings', { preHandler: [app.authenticate] }, async (req, reply) => {
    const b = (req.body ?? {}) as Record<string, any>;
    const minSeverity = SEVERITIES.includes(b.minSeverity) ? b.minSeverity : 'warning';
    const enabled = b.enabled !== false;
    const emails = typeof b.emails === 'string' ? b.emails.trim() : '';
    const whatsapp = typeof b.whatsapp === 'string' ? b.whatsapp.trim() : '';
    return withTenant(req.user.tenant, async (c) => {
      const r = await c.query(
        `INSERT INTO notification_settings (tenant_id, enabled, emails, whatsapp, min_severity)
         VALUES (current_tenant(), $1, $2, $3, $4)
         ON CONFLICT (tenant_id) DO UPDATE
           SET enabled = $1, emails = $2, whatsapp = $3, min_severity = $4, updated_at = now()
         RETURNING enabled, emails, whatsapp, min_severity, updated_at`,
        [enabled, emails, whatsapp, minSeverity],
      );
      return reply.send({ settings: r.rows[0] });
    });
  });

  // Encola una notificación de prueba (la despacha el worker `notifier`).
  app.post('/notifications/test', { preHandler: [app.authenticate] }, async (req, reply) => {
    return withTenant(req.user.tenant, async (c) => {
      // Severidad alta para que supere cualquier umbral configurado.
      await c.query(
        `INSERT INTO notification_outbox (tenant_id, kind, severity, message, asset_name)
         VALUES (current_tenant(), 'test', 'critical', 'Notificación de prueba de Trazza', 'Prueba')`,
      );
      return reply.code(202).send({ queued: true });
    });
  });
}
