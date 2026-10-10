import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { pingMongo } from '../common/mongo';
import { redis } from '../common/redis';

@Controller()
export class HealthController {
  // Liveness: the process is up. Cheap, never touches dependencies,
  // so a slow database does not get healthy instances restarted.
  @Get('healthz')
  live() {
    return { status: 'ok' };
  }

  // Readiness: can this instance serve real traffic right now?
  @Get('readyz')
  async ready() {
    const [mongo, redisOk] = await Promise.all([
      pingMongo(),
      redis.ping().then(() => true).catch(() => false),
    ]);
    const body = { status: mongo && redisOk ? 'ready' : 'degraded', mongo, redis: redisOk };
    if (!mongo) throw new ServiceUnavailableException(body);
    return body;
  }
}
