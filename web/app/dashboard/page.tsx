'use client';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError, session } from '@/lib/api';

type T = 'bp' | 'glucose' | 'weight';
interface Reading { id: string; type: T; values: any; takenAt: string }

const META: Record<T, { label: string; unit: string }> = {
  bp: { label: 'ความดัน', unit: 'mmHg' },
  glucose: { label: 'น้ำตาล', unit: 'mg/dL' },
  weight: { label: 'น้ำหนัก', unit: 'kg' },
};

function show(r?: Reading | null) {
  if (!r) return '—';
  if (r.type === 'bp') return `${r.values.systolic}/${r.values.diastolic}`;
  if (r.type === 'glucose') return `${r.values.mgdl}`;
  return `${r.values.kg}`;
}

function primary(r: Reading): number {
  return r.type === 'bp' ? r.values.systolic : r.type === 'glucose' ? r.values.mgdl : r.values.kg;
}

function Chart({ items }: { items: Reading[] }) {
  const pts = [...items].reverse().slice(-30);
  if (pts.length < 2) return <p className="muted small">บันทึกอย่างน้อย 2 ครั้งเพื่อดูกราฟ</p>;
  const W = 600, H = 160, P = 24;
  const lines: { key: string; get: (r: Reading) => number; cls: string }[] =
    pts[0].type === 'bp'
      ? [{ key: 'sys', get: (r) => r.values.systolic, cls: 'l1' }, { key: 'dia', get: (r) => r.values.diastolic, cls: 'l2' }]
      : [{ key: 'v', get: primary, cls: 'l1' }];
  const all = pts.flatMap((r) => lines.map((l) => l.get(r)));
  const min = Math.min(...all), max = Math.max(...all), span = max - min || 1;
  const x = (i: number) => P + (i * (W - 2 * P)) / (pts.length - 1);
  const y = (v: number) => H - P - ((v - min) * (H - 2 * P)) / span;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="กราฟย้อนหลัง">
      <line x1={P} x2={W - P} y1={H - P} y2={H - P} className="axis" />
      <text x={4} y={y(max) + 4} className="tick">{max}</text>
      <text x={4} y={y(min) + 4} className="tick">{min}</text>
      {lines.map((l) => (
        <g key={l.key} className={l.cls}>
          <polyline points={pts.map((r, i) => `${x(i)},${y(l.get(r))}`).join(' ')} />
          {pts.map((r, i) => <circle key={i} cx={x(i)} cy={y(l.get(r))} r={3} />)}
        </g>
      ))}
    </svg>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const [tab, setTab] = useState<T>('bp');
  const [items, setItems] = useState<Reading[]>([]);
  const [latest, setLatest] = useState<Partial<Record<T, Reading | null>>>({});
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const handle = useCallback((e: unknown) => {
    if (e instanceof ApiError) {
      if (e.status === 401) { session.clear(); return router.replace('/'); }
      if (e.status === 428) { session.admission = ''; return router.replace('/queue'); }
      if (e.status === 429) return setMsg({ kind: 'err', text: `ส่งคำขอถี่เกินไป ลองใหม่ใน ${e.retryAfter ?? 60} วินาที (rate limit)` });
      return setMsg({ kind: 'err', text: e.message });
    }
    setMsg({ kind: 'err', text: String(e) });
  }, [router]);

  const load = useCallback(async () => {
    try {
      const [list, last] = await Promise.all([api(`/readings?type=${tab}&limit=60`), api('/readings/latest')]);
      setItems(list);
      setLatest(last);
    } catch (e) { handle(e); }
  }, [tab, handle]);

  useEffect(() => {
    if (!session.token) { router.replace('/'); return; }
    load();
  }, [load, router]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    setBusy(true);
    setMsg(null);
    try {
      await api('/readings', { method: 'POST', body: JSON.stringify({ type: tab, values: f }) });
      (e.target as HTMLFormElement).reset();
      setMsg({ kind: 'ok', text: 'บันทึกแล้ว' });
      await load();
    } catch (er) { handle(er); } finally { setBusy(false); }
  }

  async function remove(id: string) {
    try { await api(`/readings/${id}`, { method: 'DELETE' }); await load(); } catch (e) { handle(e); }
  }

  return (
    <main className="wrap">
      <header className="top">
        <div>
          <p className="eyebrow">Health Log</p>
          <h1>สวัสดี {session.name}</h1>
        </div>
        <button className="ghost" onClick={() => { session.clear(); router.replace('/'); }}>ออกจากระบบ</button>
      </header>

      <section className="stats">
        {(Object.keys(META) as T[]).map((t) => (
          <button key={t} className={`stat ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>
            <span className="muted small">{META[t].label} ล่าสุด</span>
            <strong>{show(latest[t] as Reading)}</strong>
            <span className="muted small">{META[t].unit}</span>
          </button>
        ))}
      </section>

      <section className="card">
        <h2>บันทึก{META[tab].label}</h2>
        <form onSubmit={submit} className="form" key={tab}>
          {tab === 'bp' && (<>
            <label>ตัวบน (SYS)<input name="systolic" type="number" required min={50} max={260} /></label>
            <label>ตัวล่าง (DIA)<input name="diastolic" type="number" required min={30} max={180} /></label>
            <label>ชีพจร<input name="pulse" type="number" min={20} max={250} /></label>
          </>)}
          {tab === 'glucose' && (<>
            <label>ค่าน้ำตาล (mg/dL)<input name="mgdl" type="number" required min={20} max={700} /></label>
            <label>ช่วงเวลา<select name="context"><option value="fasting">ก่อนอาหาร</option><option value="after_meal">หลังอาหาร</option><option value="random">อื่นๆ</option></select></label>
          </>)}
          {tab === 'weight' && <label>น้ำหนัก (kg)<input name="kg" type="number" step="0.1" required min={2} max={400} /></label>}
          <button disabled={busy}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button>
        </form>
        {msg && <p className={msg.kind === 'ok' ? 'okmsg' : 'error'}>{msg.text}</p>}
      </section>

      <section className="card">
        <h2>ย้อนหลัง</h2>
        <Chart items={items} />
        <ul className="list">
          {items.slice(0, 15).map((r) => (
            <li key={r.id}>
              <span>{new Date(r.takenAt).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}</span>
              <strong>{show(r)} <span className="muted small">{META[r.type].unit}</span></strong>
              <button className="link" onClick={() => remove(r.id)} aria-label="ลบ">ลบ</button>
            </li>
          ))}
          {items.length === 0 && <li className="muted">ยังไม่มีข้อมูล</li>}
        </ul>
      </section>
    </main>
  );
}
