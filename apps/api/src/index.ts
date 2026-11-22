import { buildApp } from './app';
import { createContainer } from './container';

const port = Number.parseInt(process.env.PORT ?? '3000', 10);
const container = createContainer();

if (!container.ok) {
  console.error(
    JSON.stringify({
      level: 'error',
      message: container.error.message,
      code: container.error.code,
    }),
  );
  process.exit(1);
}

const app = buildApp(container.value);

try {
  await app.listen({ port, host: '0.0.0.0' });
} catch (error) {
  app.log.error(error);
  container.value.close();
  process.exit(1);
}
