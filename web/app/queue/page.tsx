'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, session } from '@/lib/api';

export default function Queue() {
  const router = useRouter();
  const [pos, setPos] = useState<number | null>(null);
  const [eta, setEta] = useState(0);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!session.token) return router.replace('/');
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    (async () => {
      try {
        if (!session.ticket) session.ticket = (await api('/queue/join', { method: 'POST' })).ticketToken;
        const poll = async () => {
          if (stop) return;
          try {
            const s = await api('/queue/status', { method: 'POST', body: JSON.stringify({ ticketToken: session.ticket }) });
            if (s.admitted) {
              session.admission = s.admissionToken;
              session.ticket = '';
              return router.replace('/dashboard');
            }
            setPos(s.position);
            setEta(s.etaSec);
            timer = setTimeout(poll, 2000);
          } catch (e: any) {
            setErr(e.message);
            timer = setTimeout(poll, (e.retryAfter || 3) * 1000);
          }
        };
        poll();
      } catch (e: any) {
        setErr(e.message);
      }
    })();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [router]);

  return (
    <main className="center">
      <section className="card login">
        <p className="eyebrow">Waiting room</p>
        <h1>{pos === null ? 'กำลังเข้าคิว…' : `คิวที่ ${pos.toLocaleString()}`}</h1>
        <p className="muted">{pos === null ? '' : `อีกประมาณ ${eta} วินาที ระบบจะพาเข้าเองอัตโนมัติ`}</p>
        <div className="bar"><span /></div>
        <p className="fine">ระบบปล่อยคนเข้าตามอัตราที่หลังบ้านรับไหว มาก่อนได้ก่อน</p>
        {err && <p className="error">{err}</p>}
      </section>
    </main>
  );
}
