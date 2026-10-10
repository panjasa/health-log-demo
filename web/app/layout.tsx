import './globals.css';
import type { ReactNode } from 'react';

export const metadata = { title: 'Health Log · Demo', description: 'บันทึกความดัน น้ำตาล น้ำหนัก' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
