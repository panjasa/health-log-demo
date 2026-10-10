# สคริปต์เดโม 5 นาที

ก่อนเข้าห้อง: เปิด `./deploy/tunnel.sh` ค้างไว้, เปิดแท็บ Web, Grafana, Jaeger, terminal

1. **ภาพรวม (1 นาที)** เปิด `docs/architecture.svg`
   "Cloud Run scale ได้ แต่ database ฟรีรับได้จำกัด เลยมี rate limit กับ waiting room กันโหลดไม่ให้ทะลุถึง database เหมือนหลักที่ใช้ปกป้อง AS400"
2. **ใช้งานจริง (1 นาที)** login ด้วย Gmail → ผ่าน waiting room → บันทึกความดัน → ดูกราฟ
3. **ยิงโหลด (2 นาที)** `./loadtest/run-cloud.sh waiting-room -e NEW_USERS=300` แล้วชี้ Grafana:
   คิวพุ่งแล้วค่อยๆ ลดตามอัตราที่ตั้งไว้ · จำนวน instance เพิ่ม · latency คงที่
   ต่อด้วย `./loadtest/run-cloud.sh spike -e TARGET_RPS=300 -e SHORT=1` ให้เห็น 429 จาก rate limit
4. **ไล่ปัญหา (30 วินาที)** เปิด trace ใน Jaeger เห็นเวลาที่ใช้ที่ Mongo และ Redis · ค้น trace id เดียวกันใน Cloud Logging
5. **ปล่อยของใหม่ (30 วินาที)** `./deploy/bluegreen.sh status api` อธิบาย green 0% → promote → rollback ได้ทันที

ปิดท้าย: "ถ้าเป็น production จะเพิ่มโดเมน + Cloudflare, Atlas dedicated + private endpoint, managed monitoring และย้าย GKE เมื่อมีหลาย service"
