import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { redis } from '../common/redis';
import { config } from '../common/config';
import { rateLimited } from '../common/metrics';

const EXEMPT = new Set(['/healthz', '/readyz']);

// Fixed-window counter in Redis, shared by every Cloud Run instance.
// Keyed per user when a token is present, otherwise per client IP.
// Over the limit -> 429 with Retry-After. If Redis is down we fail open
// so a cache outage does not take the whole API down.
@Injectable()
export class RateLimitGuard implements CanActivate {
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const res = ctx.switchToHttp().getResponse();
    if (EXEMPT.has(req.path) || req.method === 'OPTIONS') return true;

    let key: string;
    let limit: number;
    const h: string | undefined = req.headers.authorization;
    const claims = h?.startsWith('Bearer ') ? (jwt.decode(h.slice(7)) as any) : undefined;
    // Prefer the opaque users._id so keys (and Redis spans) carry no email-like ids.
    const sub: string | undefined = claims?.uid || claims?.sub;
    if (sub) {
      key = `rl:u:${sub}`;
      limit = config.rateLimit.perUserPerMinute;
    } else {
      key = `rl:ip:${req.ip}`;
      limit = config.rateLimit.perIpPerMinute;
    }
    const windowSec = 60;
    const bucket = Math.floor(Date.now() / 1000 / windowSec);
    const k = `${key}:${bucket}`;

    try {
      const [[, count]] = (await redis.multi().incr(k).expire(k, windowSec + 5).exec()) as [[null, number], unknown];
      res.setHeader('X-RateLimit-Limit', limit);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - count));
      if (count > limit) {
        const retry = windowSec - (Math.floor(Date.now() / 1000) % windowSec);
        res.setHeader('Retry-After', retry);
        rateLimited.add(1, { scope: sub ? 'user' : 'ip' });
        throw new HttpException({ statusCode: 429, message: 'Too many requests', retryAfterSec: retry }, HttpStatus.TOO_MANY_REQUESTS);
      }
    } catch (e) {
      if (e instanceof HttpException) throw e;
      console.error(JSON.stringify({ severity: 'WARNING', msg: 'rate limit skipped, redis unavailable' }));
    }
    return true;
  }
}
