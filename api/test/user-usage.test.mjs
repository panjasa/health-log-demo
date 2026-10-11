// Unit tests for UserUsageInterceptor (node:test, no extra deps). Run: npm test
import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { of, lastValueFrom } from 'rxjs';
import mod from '../dist/usage/user-usage.interceptor.js';
import otel from '../dist/common/otel.js';

const { UserUsageInterceptor, bangkokDate, usageKey, tagUser, USAGE_TTL_SEC, ENDUSER_ID } = mod;
const { setRootSpan } = otel;
const UID = '6acb26df8d57434d49984bef';

function mockSpan() {
  const attrs = {};
  return { attrs, setAttribute(k, v) { attrs[k] = v; return this; } };
}
function mockRedis({ execResult = [[null, 1], [null, 1]], reject, throwSync } = {}) {
  const calls = [];
  const chain = {
    incr(k) { calls.push(['incr', k]); return chain; },
    expire(k, s) { calls.push(['expire', k, s]); return chain; },
    exec() { calls.push(['exec']); return reject ? Promise.reject(reject) : Promise.resolve(execResult); },
  };
  return { calls, pipeline() { if (throwSync) throw throwSync; return chain; } };
}
function ctx(req, type = 'http') {
  return { getType: () => type, switchToHttp: () => ({ getRequest: () => req }) };
}
const next = { handle: () => of('ok') };
const flush = () => new Promise((r) => setImmediate(r));

test('bangkokDate uses Asia/Bangkok (UTC+7)', () => {
  assert.equal(bangkokDate(new Date('2026-10-10T16:59:59Z')), '2026-10-10');
  assert.equal(bangkokDate(new Date('2026-10-10T17:00:00Z')), '2026-10-11');
});

test('logged-in user: tags root + active span, INCR + EXPIRE 90 days', async () => {
  const redis = mockRedis();
  const root = mockSpan();
  const req = { user: { uid: UID, email: 'a@b.com' } };
  setRootSpan(req, root);
  const out = await lastValueFrom(new UserUsageInterceptor(redis).intercept(ctx(req), next));
  assert.equal(out, 'ok');
  assert.equal(root.attrs[ENDUSER_ID], UID);
  assert.ok(!Object.values(root.attrs).includes('a@b.com'), 'email must not be on spans');
  const key = usageKey(UID, bangkokDate());
  assert.deepEqual(redis.calls, [['incr', key], ['expire', key, USAGE_TTL_SEC], ['exec']]);
  assert.equal(USAGE_TTL_SEC, 90 * 86400);
});

test('tagUser sets the attribute on both root and a different active child span', () => {
  const root = mockSpan();
  const child = mockSpan();
  const req = {};
  setRootSpan(req, root);
  tagUser(req, UID, child);
  assert.equal(root.attrs[ENDUSER_ID], UID);
  assert.equal(child.attrs[ENDUSER_ID], UID);
});

test('no user (public route): skips spans and Redis, request still passes', async () => {
  const redis = mockRedis();
  const root = mockSpan();
  const req = {};
  setRootSpan(req, root);
  const out = await lastValueFrom(new UserUsageInterceptor(redis).intercept(ctx(req), next));
  assert.equal(out, 'ok');
  assert.deepEqual(root.attrs, {});
  assert.deepEqual(redis.calls, []);
});

test('old token without uid is skipped', async () => {
  const redis = mockRedis();
  await lastValueFrom(new UserUsageInterceptor(redis).intercept(ctx({ user: { sub: 'google:1', email: 'a@b.com' } }), next));
  assert.deepEqual(redis.calls, []);
});

test('Redis failures never fail or delay the request, and are logged', async () => {
  const logged = [];
  const orig = console.error;
  console.error = (m) => logged.push(m);
  try {
    for (const redis of [
      mockRedis({ reject: new Error('Stream not writeable') }),
      mockRedis({ execResult: [[new Error('OOM'), null], [null, 1]] }),
      mockRedis({ throwSync: new Error('sync boom') }),
    ]) {
      const out = await lastValueFrom(new UserUsageInterceptor(redis).intercept(ctx({ user: { uid: UID } }), next));
      assert.equal(out, 'ok');
    }
    await flush();
    assert.equal(logged.length, 3);
    assert.ok(logged.every((l) => l.includes('user usage count failed')));
  } finally {
    console.error = orig;
  }
});

test('handler result is returned even before the Redis write completes (fire-and-forget)', async () => {
  let resolveExec;
  const chain = { incr: () => chain, expire: () => chain, exec: () => new Promise((r) => (resolveExec = r)) };
  const redis = { pipeline: () => chain };
  const out = await lastValueFrom(new UserUsageInterceptor(redis).intercept(ctx({ user: { uid: UID } }), next));
  assert.equal(out, 'ok');
  resolveExec([[null, 1], [null, 1]]);
});

test('non-HTTP contexts are ignored', async () => {
  const redis = mockRedis();
  await lastValueFrom(new UserUsageInterceptor(redis).intercept(ctx({ user: { uid: UID } }, 'rpc'), next));
  assert.deepEqual(redis.calls, []);
});

test('redactUrl removes email values from URLs', () => {
  const { redactUrl, hasSensitiveQuery } = otel;
  assert.equal(redactUrl('/admin/usage?email=a%40b.com&from=2026-10-01'), '/admin/usage?email=[REDACTED]&from=2026-10-01');
  assert.equal(redactUrl('/admin/usage?from=x&Email=a@b.com'), '/admin/usage?from=x&Email=[REDACTED]');
  assert.equal(hasSensitiveQuery('/readings?type=bp'), false);
});
