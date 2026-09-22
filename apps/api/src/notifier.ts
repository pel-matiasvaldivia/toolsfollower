import { pool, withTenant } from './db.js';
import { config } from './config.js';
import {
  sendEmail, sendWhatsApp, shouldNotify, formatAlert, splitList,
  emailEnabled, whatsappEnabled,
} from './services/notify.js';

/**
 * Worker `notifier`: procesa la cola `notification_outbox` (global, sin RLS),
 * resuelve los destinatarios de cada tenant y envía por email/WhatsApp.
 * Una sola instancia (no escalar). Mismo empaquetado que la API (otro comando).
 */
const MAX_ATTEMPTS = 5;

async function tick(): Promise<void> {
  const { rows } = await pool.query(
    `SELECT id, tenant_id, kind, severity, message, asset_name
       FROM notification_outbox
      WHERE sent_at IS NULL AND attempts < $1
      ORDER BY created_at
      LIMIT 50`,
    [MAX_ATTEMPTS],
  );

  for (const o of rows) {
    try {
      const settings = await withTenant(o.tenant_id, async (c) => {
        const r = await c.query(
          `SELECT enabled, emails, whatsapp, min_severity
             FROM notification_settings WHERE tenant_id = current_tenant()`,
        );
        return r.rows[0] ?? null;
      });

      if (settings && settings.enabled && shouldNotify(o.severity, settings.min_severity)) {
        const { subject, text } = formatAlert(o);
        const emails = splitList(settings.emails);
        const numbers = splitList(settings.whatsapp);
        if (emailEnabled() && emails.length) await sendEmail(emails, subject, text);
        if (whatsappEnabled() && numbers.length) await sendWhatsApp(numbers, text);
      }
      // Marcar como procesada (aunque no haya destinatarios o esté deshabilitada).
      await pool.query('UPDATE notification_outbox SET sent_at = now() WHERE id = $1', [o.id]);
    } catch (err) {
      await pool.query('UPDATE notification_outbox SET attempts = attempts + 1 WHERE id = $1', [o.id]);
      console.error(`[notifier] fallo enviando ${o.id}:`, (err as Error).message);
    }
  }
}

console.log(
  `[notifier] iniciado (intervalo ${config.notifierIntervalMs}ms; email=${emailEnabled()}, whatsapp=${whatsappEnabled()})`,
);
const timer = setInterval(() => {
  tick().catch((e) => console.error('[notifier] error en el ciclo:', (e as Error).message));
}, config.notifierIntervalMs);

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => { clearInterval(timer); pool.end().finally(() => process.exit(0)); });
}
