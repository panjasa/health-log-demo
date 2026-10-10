import Redis from 'ioredis';
import { config } from './config';

// REDIS_PASSWORD comes from Secret Manager on Cloud Run; locally it can sit in the URL.
export const redis = new Redis(config.redisUrl, {
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: 2,
  enableOfflineQueue: false,
  lazyConnect: false,
});
redis.on('error', (e) => console.error(JSON.stringify({ level: 'error', msg: 'redis', err: e.message })));
