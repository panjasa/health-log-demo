# Runbook · Health Log Demo

คู่มือหน้างาน: URL ทั้งหมด, เช็กลิสต์ก่อนโชว์, ลำดับเดโม, แก้ปัญหา และปิดระบบ
ไฟล์นี้ไม่มีรหัสผ่านหรือ connection string ใดๆ (ทั้งหมดอยู่ใน Secret Manager)

## 1. URL

### แอป (เปิดสาธารณะ เข้าจาก browser ไหนก็ได้)

| ส่วน | URL |
| --- | --- |
| Web (หน้าเว็บหลัก) | https://health-web-4iscnqzvvq-as.a.run.app |
| Web config | https://health-web-4iscnqzvvq-as.a.run.app/api/config |
| API | https://health-api-4iscnqzvvq-as.a.run.app |
| API readiness (เช็ก Mongo + Redis) | https://health-api-4iscnqzvvq-as.a.run.app/readyz |

`/api/config` และ `/readyz` เปิดสาธารณะได้: ส่งแค่ API URL, Google Client ID (ไม่ใช่ความลับ) และ true/false

### Observability (ไม่เปิดสาธารณะ เข้าผ่าน IAP tunnel เท่านั้น)

รัน `./deploy/tunnel.sh` ค้างไว้ใน Cloud Shell แล้วเปิด **Web Preview → Change port**

| ส่วน | Port | ใช้ทำอะไร |
| --- | --- | --- |
| Grafana | 3001 | dashboard (user `admin` / รหัสที่สคริปต์ 02 สุ่มให้) |
| Jaeger | 16686 | trace ของแต่ละ request |
| Prometheus | 9090 | query metrics ดิบ |

URL ของ Web Preview (`https://3001-cs-xxxx.cloudshell.dev`) เปลี่ยนได้ทุกครั้งที่เปิด Cloud Shell ใหม่ จำแค่เลข port

ดูรหัส Grafana:

```bash
gcloud compute ssh obs-vm --zone asia-southeast1-b --tunnel-through-iap \
  --command "grep GRAFANA_PASSWORD ~/obs/.env | cut -d= -f2"
```

### Console สำหรับจัดการ

| ส่วน | URL |
| --- | --- |
| Cloud Run | https://console.cloud.google.com/run?project=health-log-demo |
| Logs | https://console.cloud.google.com/logs/query?project=health-log-demo |
| VM (obs-vm) | https://console.cloud.google.com/compute/instances?project=health-log-demo |
| Secret Manager | https://console.cloud.google.com/security/secret-manager?project=health-log-demo |
| OAuth Credentials | https://console.cloud.google.com/apis/credentials?project=health-log-demo |
| Billing | https://console.cloud.google.com/billing?project=health-log-demo |
| Cloud Shell | https://shell.cloud.google.com/?project=health-log-demo |
| MongoDB Atlas | https://cloud.mongodb.com |
| GitHub | https://github.com/panjasa/health-log-demo |

## 2. เช็กลิสต์ก่อนโชว์

**เช้าวันสัมภาษณ์**

- [ ] เปิด `/readyz` → ต้องเป็น `{"status":"ready","mongo":true,"redis":true}`
- [ ] ลอง Sign in with Google บนหน้าเว็บ แล้วบันทึกค่า 1 รายการ
- [ ] (ถ้าอยากให้ไม่มี cold start) เปิด instance ค้างไว้ 1 ตัว:
  ```bash
  gcloud run services update health-api --region asia-southeast1 --min-instances 1
  gcloud run services update health-web --region asia-southeast1 --min-instances 1
  ```
- [ ] เปิด Cloud Shell → `cd health-log-demo` → `./deploy/tunnel.sh` → เช็กว่า Grafana เปิดได้
- [ ] เช็กว่ามี k6 (`k6 version`) ถ้าไม่มี ลงใหม่ตามข้อ 3
- [ ] เปิดภาพหน้าจอสำรองไว้ในแท็บ (กรณีเน็ตห้องสัมภาษณ์มีปัญหา)

**5 นาทีก่อนเข้าห้อง**

- [ ] เปิด `/readyz` อีกครั้งให้ระบบตื่น

## 3. ลำดับเดโม (~5 นาที)

1. **หน้าเว็บ**: เปิด Web URL → Sign in with Google → ผ่าน waiting room → บันทึกค่าความดัน
2. **Architecture**: เปิด `docs/request-flow.svg` อธิบาย request ทีละขั้น และ load balancer ในตัว Cloud Run
3. **Load test** (แท็บ Cloud Shell ที่ 2):
   ```bash
   # ลง k6 ถ้ายังไม่มี (หายเมื่อ Cloud Shell รีเซ็ต)
   curl -sL https://github.com/grafana/k6/releases/download/v0.54.0/k6-v0.54.0-linux-amd64.tar.gz | tar xz
   sudo mv k6-v0.54.0-linux-amd64/k6 /usr/local/bin/

   ./loadtest/run-cloud.sh spike -e TARGET_RPS=300
   ```
   ระหว่างรัน: ชี้ Grafana ให้ดู RPS, latency p95, จำนวน instance และ 429 จาก rate limit
4. **Waiting room**: `./loadtest/run-cloud.sh waiting-room` → ชี้กราฟคิวใน Grafana
5. **Trace**: เปิด Jaeger (port 16686) → เลือก health-api → เปิด trace หนึ่งตัวให้เห็น hop ถึง Redis และ Mongo
6. **Blue/green**:
   ```bash
   ./deploy/bluegreen.sh green api     # revision ใหม่ 0% traffic
   # เปิด green URL ที่สคริปต์พิมพ์ → /readyz
   ./deploy/bluegreen.sh promote api   # หรือ rollback api
   ```
7. **ปิดด้วยการตัดสินใจ**: เปิด `docs/adr/` (Cloud Run vs GKE, waiting room, monitoring บน VM)

## 4. แก้ปัญหา

| อาการ | สาเหตุที่เป็นไปได้ | วิธีแก้ |
| --- | --- | --- |
| request แรกช้า 2–5 วินาที | cold start (min-instances = 0) | เปิด `/readyz` ล่วงหน้า หรือตั้ง min-instances 1 |
| `origin_mismatch` ตอน login | Web URL ไม่อยู่ใน Authorized JavaScript origins | เพิ่ม URL (ไม่มี `/` ท้าย) แล้วรอ 5–10 นาที |
| Login แล้ว access blocked | อีเมลไม่อยู่ใน Test users | Google Auth Platform → Audience → Test users |
| `/readyz` mongo: false | Atlas Network Access / รหัสผ่านผิด | ตรวจ `0.0.0.0/0` และ secret `mongo-uri` |
| `/readyz` redis: false | VM ปิดอยู่ หรือ container ไม่รัน | Console → VM → Start แล้ว `gcloud compute ssh obs-vm --zone asia-southeast1-b --tunnel-through-iap --command "cd ~/obs && sudo docker compose up -d"` |
| Grafana เปิดไม่ได้ | tunnel ไม่ได้รันอยู่ | รัน `./deploy/tunnel.sh` ค้างไว้ แล้ว Web Preview port 3001 |
| ได้ 404 ที่ `/readyz` | เปิดบน health-web แทน health-api | ใช้ API URL |
| 429 Too Many Requests | rate limit ทำงาน (ตั้งใจ) | รอตาม `Retry-After` |
| 428 | ยังไม่มีตั๋วคิว waiting room | เข้าคิวผ่านหน้าเว็บก่อน |

แก้ secret ที่ใส่ผิด:

```bash
gcloud secrets versions add mongo-uri --data-file=-   # วางค่าใหม่ แล้วกด Ctrl+D
./deploy/03-deploy.sh                                 # deploy ใหม่ให้ใช้ค่าล่าสุด
```

## 5. ดู request ต่อ user

- Jaeger (Grafana Explore → Jaeger): Service `health-api` → Tags `enduser.id=<userId>`
- จำนวนต่อวัน: `GET /admin/usage?email=<email>` พร้อม header `Authorization: Bearer <token ของ admin>`
- ตั้ง admin ครั้งเดียว: `gcloud run services update health-api --region asia-southeast1 --update-env-vars "^|^ADMIN_EMAILS=you@gmail.com"` (หรือใส่ `ADMIN_EMAILS` ใน `deploy/config.env` แล้ว `03-deploy.sh` จะตั้งให้)
- หลัง deploy ฟีเจอร์นี้ ต้อง logout/login ใหม่ token ถึงจะมี userId

## 6. Deploy อัตโนมัติจาก GitHub

ตั้งครั้งเดียว (Cloud Shell): `./deploy/04-setup-github-ci.sh`

หลังจากนั้นแก้โค้ดแล้ว push เข้า `main` → GitHub Actions ทำให้เอง: test → build → green 0% → `/readyz` → promote 100%
ดูสถานะ: https://github.com/panjasa/health-log-demo/actions
ย้อนกลับ: Actions → deploy → Run workflow → `rollback`

## 7. ค่าใช้จ่ายและการปิดระบบ

| ส่วน | ค่าใช้จ่าย |
| --- | --- |
| Cloud Run (min-instances 0) | แทบ 0 ในระดับเดโม |
| VM e2-medium | ~$1/วัน คิดตลอดที่เปิด |
| MongoDB Atlas M0 | ฟรี |

หลังสัมภาษณ์:

```bash
# ถ้าตั้ง min-instances 1 ไว้ ให้คืนเป็น 0
gcloud run services update health-api --region asia-southeast1 --min-instances 0
gcloud run services update health-web --region asia-southeast1 --min-instances 0

# ลบ Cloud Run และ VM (เก็บ secret กับ image ไว้ deploy ใหม่ได้) สคริปต์จะถามยืนยัน ตอบ y
./deploy/99-teardown.sh
```
