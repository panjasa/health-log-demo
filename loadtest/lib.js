import http from 'k6/http';
import { sleep } from 'k6';

export const API = __ENV.API_URL || 'http://localhost:8080';
export const TOKENS = JSON.parse(open(__ENV.TOKENS_FILE || './tokens.json'));

export function auth(token, admission) {
  const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  if (admission) h['X-Admission-Token'] = admission;
  return { headers: h };
}

// Walk one user through the waiting room and return their admission token.
export function admit(token, maxWaitSec = 120) {
  const deadline = Date.now() + maxWaitSec * 1000;
  let join = http.post(`${API}/queue/join`, null, auth(token));
  while (join.status === 429 && Date.now() < deadline) {
    sleep(Number(join.headers['Retry-After'] || 5));
    join = http.post(`${API}/queue/join`, null, auth(token));
  }
  if (join.status !== 201 && join.status !== 200) return null;
  const ticketToken = join.json('ticketToken');
  while (Date.now() < deadline) {
    const s = http.post(`${API}/queue/status`, JSON.stringify({ ticketToken }), auth(token));
    if (s.status === 201 || s.status === 200) {
      if (s.json('admitted')) return s.json('admissionToken');
    }
    // Poll like the real page does (every 2s) so polling itself stays under the rate limit.
    sleep(s.status === 429 ? Number(s.headers['Retry-After'] || 5) : 2);
  }
  return null;
}
