import { randomUUID } from 'crypto';
// Loaded with `node -r ./dist/tracing.js` so instrumentation is active before
// Express, MongoDB and ioredis are imported. Sends traces and metrics over OTLP
// to the OpenTelemetry Collector, which fans out to Jaeger and Prometheus.
import { NodeSDK, metrics } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

if (endpoint) {
  const token = process.env.OTEL_INGEST_TOKEN;
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  process.env.OTEL_SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'health-api';
  // Unique per process, so Grafana can count running Cloud Run instances.
  const instanceId = process.env.K_REVISION ? `${process.env.K_REVISION}-${randomUUID().slice(0, 8)}` : randomUUID();
  process.env.OTEL_RESOURCE_ATTRIBUTES = [process.env.OTEL_RESOURCE_ATTRIBUTES, `service.instance.id=${instanceId}`, `service.version=${process.env.K_REVISION || 'local'}`].filter(Boolean).join(',');
  const sdk = new NodeSDK({
    traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces`, headers }),
    metricReader: new metrics.PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({ url: `${endpoint}/v1/metrics`, headers }),
      exportIntervalMillis: 5000,
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
        '@opentelemetry/instrumentation-net': { enabled: false },
      }),
    ],
  });
  sdk.start();
  const shutdown = () => sdk.shutdown().finally(() => process.exit(0));
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
