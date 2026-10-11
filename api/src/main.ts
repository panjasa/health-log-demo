import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { config } from './common/config';
import { getDb } from './common/mongo';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ['error', 'warn'] });
  app.set('trust proxy', true); // Cloud Run sits behind Google's load balancer
  app.use(helmet());
  app.enableCors({
    origin: config.webOrigin,
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Admission-Token', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'Retry-After', 'X-RateLimit-Remaining', 'X-App-Version'],
  });
  app.enableShutdownHooks();
  getDb().catch((e) => console.error(JSON.stringify({ severity: 'ERROR', msg: 'mongo connect failed', err: e.message })));
  await app.listen(config.port, '0.0.0.0');
  console.log(JSON.stringify({ severity: 'INFO', msg: `health-api listening on ${config.port}` }));
}
bootstrap();
