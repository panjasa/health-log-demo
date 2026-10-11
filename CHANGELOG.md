# Changelog

เวอร์ชันแบบ [Semantic Versioning](https://semver.org/lang/th/): `MAJOR.MINOR.PATCH`
- **MAJOR** เปลี่ยนแบบเข้ากับของเดิมไม่ได้ (เช่น API เปลี่ยนรูปแบบ)
- **MINOR** เพิ่มฟีเจอร์ใหม่ ของเดิมยังใช้ได้
- **PATCH** แก้บั๊ก

ออกเวอร์ชันใหม่: แก้ไฟล์ `VERSION` + เพิ่มหัวข้อในไฟล์นี้ แล้ว push เข้า `main`
CI จะ deploy และสร้าง git tag `vX.Y.Z` ให้เอง

## v1.0.0 · 2026-10-11

- Web (Next.js) + API (NestJS) บน Cloud Run, login ด้วย Google
- Rate limit + waiting room บน Redis
- MongoDB Atlas, health check `/healthz` `/readyz`
- Observability: OpenTelemetry → Prometheus / Grafana, Jaeger, Cloud Logging
- นับ request ต่อ user: `enduser.id` บน trace, Redis รายวัน, `GET /admin/usage`
- Blue/green + deploy อัตโนมัติจาก GitHub Actions (keyless)
- แสดงเลขเวอร์ชัน: `GET /version`, header `X-App-Version`, ท้ายหน้าเว็บ
