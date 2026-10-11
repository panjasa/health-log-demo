'use client';
import { useEffect, useState } from 'react';

type V = { version: string; commit: string };

// Shows which build of the web and the API is running, e.g. "Web v1.0.0 · abc1234 | API v1.0.0 · abc1234".
// Web info comes from its own runtime config; API info from GET /version (no auth, not rate limited).
export default function VersionBadge() {
  const [web, setWeb] = useState<V | null>(null);
  const [api, setApi] = useState<V | null>(null);
  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((c) => {
        setWeb({ version: c.version, commit: c.commit });
        return fetch(`${c.apiUrl}/version`).then((r) => r.json());
      })
      .then((v) => setApi({ version: v.version, commit: v.commit }))
      .catch(() => {});
  }, []);
  const fmt = (v: V | null) => (v ? `v${v.version} · ${v.commit}` : '…');
  return (
    <footer className="fine" style={{ textAlign: 'center', padding: '0 0 1rem' }}>
      Web {fmt(web)} | API {fmt(api)}
    </footer>
  );
}
