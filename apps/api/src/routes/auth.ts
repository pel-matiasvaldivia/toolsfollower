import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';

export async function registerAuthRoutes(app: FastifyInstance) {
  // Registro: crea tenant + usuario owner en una transacción.
  app.post('/auth/register', async (req, reply) => {
    const { company, name, email, password } = (req.body ?? {}) as Record<string, string>;
    if (!company || !name || !email || !password) {
      return reply.code(400).send({ error: 'company, name, email y password son requeridos' });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const hash = await bcrypt.hash(password, 10);
      const slug = company.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const t = await client.query(
        'INSERT INTO tenants (name, slug) VALUES ($1, $2) RETURNING id',
        [company, slug || null],
      );
      const tenantId = t.rows[0].id as string;
      const u = await client.query(
        'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id',
        [email.toLowerCase(), hash, name],
      );
      const userId = u.rows[0].id as string;
      await client.query(
        "INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, $2, 'owner')",
        [tenantId, userId],
      );
      await client.query('COMMIT');
      const token = app.jwt.sign({ sub: userId, tenant: tenantId, role: 'owner', name });
      return { token, tenant: { id: tenantId, name: company }, user: { id: userId, name, email } };
    } catch (err: any) {
      await client.query('ROLLBACK');
      if (err?.code === '23505') return reply.code(409).send({ error: 'email o empresa ya existente' });
      req.log.error(err);
      return reply.code(500).send({ error: 'error interno' });
    } finally {
      client.release();
    }
  });

  // Login: valida credenciales y devuelve token del primer tenant del usuario.
  app.post('/auth/login', async (req, reply) => {
    const { email, password } = (req.body ?? {}) as Record<string, string>;
    if (!email || !password) return reply.code(400).send({ error: 'email y password requeridos' });
    const r = await pool.query(
      `SELECT u.id, u.name, u.password_hash, m.tenant_id, m.role, t.name AS tenant_name
         FROM users u
         JOIN memberships m ON m.user_id = u.id
         JOIN tenants t ON t.id = m.tenant_id
        WHERE u.email = $1
        ORDER BY m.created_at ASC
        LIMIT 1`,
      [email.toLowerCase()],
    );
    if (r.rowCount === 0) return reply.code(401).send({ error: 'credenciales inválidas' });
    const row = r.rows[0];
    if (!(await bcrypt.compare(password, row.password_hash))) {
      return reply.code(401).send({ error: 'credenciales inválidas' });
    }
    const token = app.jwt.sign({ sub: row.id, tenant: row.tenant_id, role: row.role, name: row.name });
    return {
      token,
      tenant: { id: row.tenant_id, name: row.tenant_name },
      user: { id: row.id, name: row.name },
    };
  });

  app.get('/me', { preHandler: [app.authenticate] }, async (req) => ({ user: req.user }));
}
