import Fastify, { type FastifyInstance } from 'fastify';

import type { ApiContainer } from './container';
import { registerInvestorRoutes } from './routes/investors';
import { registerOrderRoutes } from './routes/orders';

export interface BuildAppOptions {
  logger?: boolean;
}

export function buildApp(
  container: ApiContainer,
  options: BuildAppOptions = {},
): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? true });

  app.get('/health', async () => ({ ok: true }));
  registerInvestorRoutes(app, container);
  registerOrderRoutes(app, container);

  return app;
}
