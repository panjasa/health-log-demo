// Flash-sale style test: NEW_USERS people arrive within ~10 seconds and
// all join the waiting room. Watch the queue drain at ADMIT_PER_SEC on Grafana.
//   k6 run -e API_URL=... -e NEW_USERS=300 waiting-room.js
import { Trend, Counter } from 'k6/metrics';
import { API, TOKENS, admit } from './lib.js';

const N = Math.min(Number(__ENV.NEW_USERS || 300), TOKENS.length);
const waitTime = new Trend('time_to_admission_ms', true);
const admitted = new Counter('admitted_users');

export const options = {
  scenarios: {
    rush: { executor: 'per-vu-iterations', vus: N, iterations: 1, maxDuration: '10m' },
  },
};

export default function () {
  const start = Date.now();
  const token = TOKENS[__VU - 1];
  if (admit(token, 600)) {
    admitted.add(1);
    waitTime.add(Date.now() - start);
  }
}
