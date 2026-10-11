function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') throw new Error(`Missing env ${name}`);
  return v;
}

export const config = {
  port: Number(process.env.PORT || 8080),
  mongoUri: required('MONGO_URI', 'mongodb://localhost:27017'),
  mongoDb: process.env.MONGO_DB || 'health',
  redisUrl: required('REDIS_URL', 'redis://localhost:6379'),
  jwtSecret: required('JWT_SECRET', 'dev-only-change-me'),
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  webOrigin: (process.env.WEB_ORIGIN || 'http://localhost:3000').split(','),
  devLogin: process.env.DEV_LOGIN === 'true',
  // Who may call /admin/*. There is no role system yet, so admins are listed by email.
  adminEmails: (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
  rateLimit: {
    perUserPerMinute: Number(process.env.RATE_LIMIT_PER_MIN || 60),
    perIpPerMinute: Number(process.env.RATE_LIMIT_IP_PER_MIN || 600),
  },
  waitingRoom: {
    enabled: process.env.WAITING_ROOM_ENABLED !== 'false',
    admitPerSecond: Number(process.env.WAITING_ROOM_ADMIT_PER_SEC || 20),
    admissionTtlSec: Number(process.env.WAITING_ROOM_TTL_SEC || 600),
  },
};
