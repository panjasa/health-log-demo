import type { Span } from '@opentelemetry/api';

// The HTTP server span (root of every request trace) is created by
// @opentelemetry/instrumentation-http before Express or Nest run. Spans that are
// active later (Express middleware, Nest handler) are children of it, so to tag
// the root we keep a reference on the request object in the instrumentation's
// requestHook (see tracing.ts) and read it back here.
export const ROOT_SPAN_KEY = '__otelRootSpan';

export function setRootSpan(req: object, span: Span): void {
  (req as any)[ROOT_SPAN_KEY] = span;
}

export function getRootSpan(req: object | undefined): Span | undefined {
  return req ? (req as any)[ROOT_SPAN_KEY] : undefined;
}

// Query parameters whose values must never reach traces (PII). /admin/usage?email=...
const SENSITIVE_QUERY = /([?&](?:email)=)[^&#]*/gi;

export function redactUrl(url: string): string {
  return url.replace(SENSITIVE_QUERY, '$1[REDACTED]');
}

export function hasSensitiveQuery(url: string | undefined): boolean {
  return !!url && /[?&]email=/i.test(url);
}
