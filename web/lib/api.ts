'use client';

export interface RuntimeConfig {
  apiUrl: string;
  googleClientId: string;
}

let cfg: Promise<RuntimeConfig> | null = null;
export function getConfig(): Promise<RuntimeConfig> {
  if (!cfg) cfg = fetch('/api/config').then((r) => r.json());
  return cfg;
}

const store = typeof window !== 'undefined' ? window.sessionStorage : undefined;
export const session = {
  get token() { return store?.getItem('token') || ''; },
  set token(v: string) { v ? store?.setItem('token', v) : store?.removeItem('token'); },
  get admission() { return store?.getItem('admission') || ''; },
  set admission(v: string) { v ? store?.setItem('admission', v) : store?.removeItem('admission'); },
  get ticket() { return store?.getItem('ticket') || ''; },
  set ticket(v: string) { v ? store?.setItem('ticket', v) : store?.removeItem('ticket'); },
  get name() { return store?.getItem('name') || ''; },
  set name(v: string) { v ? store?.setItem('name', v) : store?.removeItem('name'); },
  clear() { store?.clear(); },
};

export class ApiError extends Error {
  constructor(public status: number, message: string, public retryAfter?: number) {
    super(message);
  }
}

export async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const { apiUrl } = await getConfig();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session.token) headers.Authorization = `Bearer ${session.token}`;
  if (session.admission) headers['X-Admission-Token'] = session.admission;
  const res = await fetch(`${apiUrl}${path}`, { ...init, headers: { ...headers, ...(init.headers as any) } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const retry = Number(res.headers.get('Retry-After')) || body.retryAfterSec;
    throw new ApiError(res.status, body.message || res.statusText, retry);
  }
  return res.json();
}
