# ADR-0001: Cloud Run แทน GKE

**สถานะ:** ใช้งาน

## บริบท
ระบบมี 2 service (Web, API) โหลดไม่สม่ำเสมอ มีช่วงพีคสั้นๆ ทีมเล็ก งบจำกัด

## ตัวเลือก
| | Cloud Run | GKE Autopilot |
| --- | --- | --- |
| ค่าใช้จ่ายตอนว่าง | ~0 (scale to zero) | มีค่า cluster + pod ตลอด |
| งานดูแล | แทบไม่มี | version upgrade, add-on, network policy |
| Autoscale / LB / HTTPS | มาในตัว | ต้องตั้ง HPA, Ingress, cert |
| Blue/green | revision + traffic tag | Argo Rollouts / Ingress weight |
| ยืดหยุ่น | จำกัด (ไม่มี sidecar ซับซ้อน, service mesh) | เต็มที่ |

## ตัดสินใจ
ใช้ Cloud Run

## ผลที่ตามมา
- ต้นทุนเกือบศูนย์ ขึ้นระบบเร็ว
- ไม่มี sidecar จึงรัน Redis / monitoring แยกไปที่ VM
- ถ้าเพิ่มเป็นหลาย service และมีทีม platform จะย้ายไป GKE ได้ เพราะเป็น container อยู่แล้ว (`k8s/api.yaml`)
