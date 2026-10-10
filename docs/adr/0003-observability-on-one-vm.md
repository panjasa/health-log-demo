# ADR-0003: Monitoring บน VM เครื่องเดียว

**สถานะ:** ใช้งาน (เฉพาะเดโม)

## บริบท
Cloud Run ไม่เหมาะรัน Prometheus, Grafana, Jaeger, Redis ที่ต้องรันค้างตลอด และมี state

## ตัดสินใจ
รวมไว้ที่ VM e2-medium เครื่องเดียวใน VPC ไม่เปิด port สาธารณะ
- Cloud Run ต่อเข้ามาทาง Direct VPC egress (firewall เปิดเฉพาะ subnet ของ Cloud Run)
- คนเปิด Grafana / Jaeger ผ่าน IAP tunnel
- OTLP endpoint ต้องแนบ bearer token

## ผลที่ตามมา
- ต้นทุน ~$25–35/เดือน ปิดได้หลังเดโม
- เป็น single point of failure: VM ล่ม = rate limit fail open, waiting room ใช้ไม่ได้, monitoring หาย
- Production: Memorystore (Redis), Google Managed Prometheus หรือ Grafana Cloud, Cloud Trace
