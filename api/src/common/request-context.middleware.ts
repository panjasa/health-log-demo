import { Injectable, NestMiddleware } from '@nestjs/common';
import { trace } from '@opentelemetry/api';
import { randomUUID } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { requestCounter, requestDuration } from './metrics';
import { versionLabel } from './version';

// Correlation id + one structured JSON log line per request.
// Cloud Logging parses JSON from stdout; the trace id links the log to Jaeger.
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const start = process.hrtime.bigint();
    const requestId = (req.headers['x-request-id'] as string) || randomUUID();
    res.setHeader('x-request-id', requestId);
    res.setHeader('x-app-version', versionLabel);
    (req as any).requestId = requestId;
    const traceId = trace.getActiveSpan()?.spanContext().traceId;
    const project = process.env.GOOGLE_CLOUD_PROJECT;

    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      const route = (req as any).route?.path ? `${req.baseUrl}${(req as any).route.path}` : 'unmatched';
      const attrs = { route, method: req.method, status: String(res.statusCode) };
      if (route !== '/metrics') {
        requestCounter.add(1, attrs);
        requestDuration.record(ms, attrs);
      }
      if (req.path === '/healthz') return;
      console.log(
        JSON.stringify({
          severity: res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARNING' : 'INFO',
          msg: 'request',
          requestId,
          traceId,
          // Lets Cloud Logging group every log line of one request together.
          'logging.googleapis.com/trace': project && traceId ? `projects/${project}/traces/${traceId}` : undefined,
          method: req.method,
          path: req.path,
          status: res.statusCode,
          durationMs: Math.round(ms),
          version: versionLabel,
          userId: (req as any).user?.sub,
          uid: (req as any).user?.uid,
        }),
      );
    });
    next();
  }
}
