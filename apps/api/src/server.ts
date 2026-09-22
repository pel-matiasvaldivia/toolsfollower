import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { config } from './config.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerAssetRoutes } from './routes/assets.js';
import { registerTelemetryRoutes } from './routes/telemetry.js';
import { registerGeofenceRoutes } from './routes/geofences.js';
import { registerMaintenanceRoutes } from './routes/maintenance.js';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; tenant: string; role: string; name: string };
    user: { sub: string; tenant: string; role: string; name: string };
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: any, reply: any) => Promise<void>;
  }
}

const app = Fastify({ logger: true, trustProxy: true });

await app.register(cors, { origin: true });
await app.register(jwt, { secret: config.jwtSecret });

// Decorador de autenticación reutilizable.
app.decorate('authenticate', async (req: any, reply: any) => {
  try {
    await req.jwtVerify();
  } catch {
    reply.code(401).send({ error: 'unauthorized' });
  }
});

app.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }));

await registerAuthRoutes(app);
await registerAssetRoutes(app);
await registerTelemetryRoutes(app);
await registerGeofenceRoutes(app);
await registerMaintenanceRoutes(app);

try {
  await app.listen({ port: config.port, host: config.host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
