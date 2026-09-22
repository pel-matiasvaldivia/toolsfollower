import type { PoolClient } from 'pg';

/**
 * Evalúa los planes de mantenimiento de un activo y genera una alerta
 * `maintenance_due` cuando alguno está vencido:
 *  - estrategia 'hours': last_engine_hours >= next_due_hours
 *  - estrategia 'calendar': now() >= next_due_at
 * Evita duplicar (una alerta abierta por activo). Debe correr dentro de una
 * transacción con el tenant seteado (withTenant).
 */
export async function evaluateMaintenance(
  client: PoolClient,
  assetId: string | null,
): Promise<void> {
  if (!assetId) return;

  const due = await client.query(
    `SELECT p.id, p.strategy
       FROM maintenance_plans p
       JOIN assets a ON a.id = p.asset_id
      WHERE p.asset_id = $1
        AND (
          (p.strategy = 'hours'    AND p.next_due_hours IS NOT NULL
             AND a.last_engine_hours IS NOT NULL
             AND a.last_engine_hours >= p.next_due_hours)
          OR
          (p.strategy = 'calendar' AND p.next_due_at IS NOT NULL
             AND now() >= p.next_due_at)
        )
      LIMIT 1`,
    [assetId],
  );
  if (due.rowCount === 0) return;

  await client.query(
    `INSERT INTO alerts (tenant_id, asset_id, kind, severity, message)
     SELECT current_tenant(), $1, 'maintenance_due', 'warning',
            'Mantenimiento vencido'
      WHERE NOT EXISTS (
        SELECT 1 FROM alerts
         WHERE asset_id = $1 AND kind = 'maintenance_due' AND resolved_at IS NULL
      )`,
    [assetId],
  );
}
