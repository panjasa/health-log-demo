import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { pingMongo } from '../common/mongo';
import { redis } from '../common/redis';
import { appVersion } from '../common/version';

@Controller()
export class HealthController {
  // Liveness: the process is up. Cheap, never touches dependencies,
  // so a slow database does not get healthy instances restarted.
  @Get('healthz')
  live() {
    return { status: 'ok' };
  }

  // Which build is serving: version from the VERSION file, git commit, Cloud Run revision.
  @Get('version')
  version() {
    return appVersion;
  }

  // Readiness: can this instance serve real traffic right now?
  @Get('readyz')
  async ready() {
    const [mongo, redisOk] = await Promise.all([
      pingMongo(),
      redis.ping().then(() => true).catch(() => false),
    ]);
    const body = { status: mongo && redisOk ? 'ready' : 'degraded', mongo, redis: redisOk, version: appVersion.version };
    if (!mongo) throw new ServiceUnavailableException(body);
    return body;
  }
}
