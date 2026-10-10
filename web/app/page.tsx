'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getConfig, session } from '@/lib/api';

declare global {
  interface Window { google?: any }
}

export default function Login() {
  const router = useRouter();
  const btn = useRef<HTMLDivElement>(null);
  const [server, setServer] = useState<{ googleEnabled: boolean; devLogin: boolean; waitingRoom: boolean } | null>(null);
  const [err, setErr] = useState('');
  const [email, setEmail] = useState('demo@example.com');

  async function finish(res: { token: string; user: { name?: string; email: string } }, waitingRoom: boolean) {
    session.token = res.token;
    session.name = res.user.name || res.user.email;
    session.admission = '';
    router.push(waitingRoom ? '/queue' : '/dashboard');
  }

  useEffect(() => {
    (async () => {
      try {
        const s = await api('/auth/config');
        setServer(s);
        const { googleClientId } = await getConfig();
        if (!s.googleEnabled || !googleClientId) return;
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.onload = () => {
          window.google.accounts.id.initialize({
            client_id: googleClientId,
            callback: async (r: { credential: string }) => {
              try {
                const res = await api('/auth/google', { method: 'POST', body: JSON.stringify({ idToken: r.credential }) });
                await finish(res, s.waitingRoom);
              } catch (e: any) {
                setErr(e.message);
              }
            },
          });
          window.google.accounts.id.renderButton(btn.current, { theme: 'outline', size: 'large', shape: 'pill', width: 280 });
        };
        document.body.appendChild(script);
      } catch {
        setErr('ติดต่อ API ไม่ได้');
      }
    })();
  }, []);

  async function devLogin() {
    try {
      const res = await api('/auth/dev', { method: 'POST', body: JSON.stringify({ email }) });
      await finish(res, !!server?.waitingRoom);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  return (
    <main className="center">
      <section className="card login">
        <p className="eyebrow">Health Log · Architecture Demo</p>
        <h1>บันทึกสุขภาพประจำวัน</h1>
        <p className="muted">ความดัน · น้ำตาล · น้ำหนัก</p>
        <div ref={btn} className="gbtn" />
        {server?.devLogin && (
          <div className="dev">
            <input value={email} onChange={(e) => setEmail(e.target.value)} aria-label="email" />
            <button className="ghost" onClick={devLogin}>Dev login</button>
          </div>
        )}
        {server && !server.googleEnabled && !server.devLogin && <p className="muted">ยังไม่ได้ตั้งค่า login</p>}
        {err && <p className="error">{err}</p>}
        <p className="fine">ระบบตัวอย่าง ห้ามใส่ข้อมูลสุขภาพจริง</p>
      </section>
    </main>
  );
}
