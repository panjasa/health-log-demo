import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from '@nestjs/common';
import { Span, context, trace } from '@opentelemetry/api';
import { suppressTracing } from '@opentelemetry/core';
import type { Observable } from 'rxjs';
import { getRootSpan, hasSensitiveQuery, redactUrl } from '../common/otel';

export const USAGE_REDIS = Symbol('USAGE_REDIS');
export const USAGE_TTL_SEC = 90 * 24 * 60 * 60;
export const ENDUSER_ID = 'enduser.id';

/** Minimal Redis surface the interceptor needs (ioredis-compatible), so tests can mock it. */
export interface UsageRedis {
  pipeline(): { incr(key: string): any; expire(key: string, seconds: number): any; exec(): Promise<any> };
}

const bangkokFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Bangkok',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Calendar date in Asia/Bangkok as YYYY-MM-DD. */
export function bangkokDate(d: Date = new Date()): string {
  return bangkokFmt.format(d);
}

export function usageKey(userId: string, date: string): string {
  return `usage:${userId}:${date}`;
}

/**
 * Tag the request's spans with the user id. Only the id goes on spans: no email (PII).
 * The root HTTP server span is the one Jaeger search matches most usefully; the active
 * span inside an interceptor is a child (Express / Nest instrumentation), so tag both.
 */
export function tagUser(req: object, userId: string, active: Span | undefined = trace.getActiveSpan()): void {
  const root = getRootSpan(req);
  root?.setAttribute(ENDUSER_ID, userId);
  if (active && active !== root) active.setAttribute(ENDUSER_ID, userId);
}

// Runs after guards, so req.user is set on routes protected by AuthGuard.
// Counter write uses a pipeline (INCR + EXPIRE in one round trip, no MULTI/EXEC overhead).
// Routes without a logged-in user are skipped. The Redis write is fire-and-forget:
// it never delays or fails the request, errors are only logged.
// userId is deliberately NOT a Prometheus label (unbounded cardinality); per-user
// counts live in Redis and are read through GET /admin/usage.
@Injectable()
export class UserUsageInterceptor implements NestInterceptor {
  constructor(@Inject(USAGE_REDIS) private readonly redis: UsageRedis) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() === 'http') {
      const req = ctx.switchToHttp().getRequest();
      // Nest's handler span copies the raw URL; strip PII query values from it too.
      if (hasSensitiveQuery(req?.originalUrl)) trace.getActiveSpan()?.setAttribute('http.url', redactUrl(req.originalUrl));
      const userId: string | undefined = req?.user?.uid;
      if (userId) {
        tagUser(req, userId);
        this.count(userId);
      }
    }
    return next.handle();
  }

  count(userId: string, now: Date = new Date()): void {
    const key = usageKey(userId, bangkokDate(now));
    // Bookkeeping write: no Redis spans for it, so it adds no tracing overhead or noise.
    context.with(suppressTracing(context.active()), () => this.write(key));
  }

  private write(key: string): void {
    try {
      this.redis
        .pipeline()
        .incr(key)
        .expire(key, USAGE_TTL_SEC)
        .exec()
        .then((results: Array<[Error | null, unknown]> | null) => {
          const err = results?.find(([e]) => e)?.[0];
          if (err) logError(err);
        })
        .catch(logError);
    } catch (e) {
      logError(e);
    }
  }
}

function logError(e: unknown): void {
  console.error(JSON.stringify({ severity: 'WARNING', msg: 'user usage count failed', err: (e as Error)?.message ?? String(e) }));
}
