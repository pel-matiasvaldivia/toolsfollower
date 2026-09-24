import type { PoolClient } from 'pg';

/** Alerta recién creada, tal como la devuelve el INSERT ... RETURNING. */
export interface NewAlert {
  id: string;
  asset_id: string | null;
  kind: string;
  severity: string;
  message: string;
}

/**
 * Encola una alerta recién generada en la cola de notificaciones (outbox). El
 * worker `notifier` la toma, resuelve los destinatarios del tenant y envía.
 * Debe correr dentro de la transacción del tenant (withTenant).
 */
export async function enqueueAlert(c: PoolClient, alert: NewAlert): Promise<void> {
  let assetName: string | null = null;
  if (alert.asset_id) {
    const a = await c.query('SELECT name FROM assets WHERE id = $1', [alert.asset_id]);
    assetName = a.rows[0]?.name ?? null;
  }
  await c.query(
    `INSERT INTO notification_outbox (tenant_id, alert_id, kind, severity, message, asset_name)
     VALUES (current_tenant(), $1, $2, $3, $4, $5)`,
    [alert.id, alert.kind, alert.severity, alert.message, assetName],
  );
}
