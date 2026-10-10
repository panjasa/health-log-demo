// Quick check that everything works: 5 users for 30 seconds.
//   k6 run -e API_URL=... smoke.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { API, TOKENS, auth, admit } from './lib.js';

export const options = { vus: 5, duration: '30s', thresholds: { http_req_failed: ['rate<0.05'] } };

export function setup() {
  return { admissions: TOKENS.slice(0, 5).map((t) => admit(t)) };
}

export default function (data) {
  const i = (__VU - 1) % 5;
  const p = auth(TOKENS[i], data.admissions[i]);
  check(http.get(`${API}/healthz`), { 'healthz 200': (r) => r.status === 200 });
  check(http.get(`${API}/readings?type=bp`, p), { 'list 200': (r) => r.status === 200 });
  check(
    http.post(`${API}/readings`, JSON.stringify({ type: 'weight', values: { kg: 60 + Math.random() * 20 } }), p),
    { 'create 201': (r) => r.status === 201 },
  );
  sleep(3); // ~40 req/min per user, under the default 60/min limit
}
