// Spike test: ramps to TARGET_RPS (default 300) and holds, then drops.
// Expect: Cloud Run adds instances, rate limit starts returning 429 for users
// who exceed their per-minute budget, latency p95 stays flat.
//   k6 run -e API_URL=... -e TARGET_RPS=300 spike.js
import http from 'k6/http';
import { check } from 'k6';
import { API, TOKENS, auth, admit } from './lib.js';

const TARGET = Number(__ENV.TARGET_RPS || 300);
const SHORT = !!__ENV.SHORT; // SHORT=1 for a 1-minute dry run
const USERS = Math.min(Number(__ENV.USERS || 100), TOKENS.length);

export const options = {
  setupTimeout: '5m',
  scenarios: {
    spike: {
      executor: 'ramping-arrival-rate',
      startRate: 10,
      timeUnit: '1s',
      preAllocatedVUs: 200,
      maxVUs: 1000,
      stages: [
        { target: TARGET, duration: SHORT ? '20s' : '1m' },
        { target: TARGET, duration: SHORT ? '30s' : '2m' },
        { target: 0, duration: SHORT ? '10s' : '30s' },
      ],
    },
  },
  thresholds: {
    'http_req_duration{expected_response:true}': ['p(95)<800'],
    'checks{kind:not5xx}': ['rate>0.99'],
  },
};

export function setup() {
  return { admissions: TOKENS.slice(0, USERS).map((t) => admit(t)) };
}

export default function (data) {
  const i = Math.floor(Math.random() * USERS);
  const p = auth(TOKENS[i], data.admissions[i]);
  const r = Math.random() < 0.8
    ? http.get(`${API}/readings?type=bp&limit=20`, p)
    : http.post(`${API}/readings`, JSON.stringify({ type: 'bp', values: { systolic: 110 + Math.round(Math.random() * 30), diastolic: 70 + Math.round(Math.random() * 15) } }), p);
  check(r, { 'no 5xx': (x) => x.status < 500 }, { kind: 'not5xx' });
  check(r, { 'served (not 429)': (x) => x.status !== 429 });
}
