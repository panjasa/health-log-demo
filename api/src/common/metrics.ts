import { metrics } from '@opentelemetry/api';

// Custom business metrics. Exported via OTLP -> Collector -> Prometheus.
// Prometheus names: api_requests_total, api_request_duration_milliseconds_*,
// rate_limited_total, waiting_room_joined_total, waiting_room_admitted_total,
// waiting_room_queue_length
const meter = metrics.getMeter('health-api');

export const requestCounter = meter.createCounter('api_requests', {
  description: 'HTTP requests by route, method and status',
});
export const requestDuration = meter.createHistogram('api_request_duration', {
  description: 'HTTP request duration',
  unit: 'ms',
});
export const rateLimited = meter.createCounter('rate_limited', {
  description: 'Requests rejected with 429',
});
export const waitingJoined = meter.createCounter('waiting_room_joined');
export const waitingAdmitted = meter.createCounter('waiting_room_admitted');

let lastQueueLength = 0;
export function setQueueLength(n: number) {
  lastQueueLength = n;
}
meter
  .createObservableGauge('waiting_room_queue_length', { description: 'People waiting in the queue' })
  .addCallback((r) => r.observe(lastQueueLength));
