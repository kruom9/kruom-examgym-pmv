# Exam Gym ปิยมิตรมัธยม (ม.1–ม.6) · โรงเรียนปิยมิตรวิทยา

> **สถานะ: ฉบับทดลอง / ร่าง (draft, not yet open to students).**
> ข้อสอบ ม.1–ม.5 ทั้งหมด 1,074 ข้อ เป็น **ร่าง (Helix topic, draft)** ที่ยังรอครูผู้สอนตรวจทาน (รวม 45 ข้อที่ถูก flag ไว้) ข้อสอบจะยังเป็น `status='draft'` จนกว่าครูจะตรวจและเปลี่ยนเป็น `reviewed`
> All ม.1–ม.5 items are drafts pending teacher review. ม.6 items (827) are imported as-is from the existing ม.6 app; ม.6 students keep using the existing ม.6 app during the transition.

One static web app (`apps/web/`, one design system `assets/eg.css`) + one Supabase schema (`supabase/migrations`, `supabase/seed.sql`).
Hosted with GitHub Pages (root `index.html` redirects to `apps/web/`). The frontend holds only the public project URL + anon/publishable key; no secrets, rosters or personal data are stored in this repo.

- Content: `content/src/m1..m5.txt` (Helix Term 2 chapters, original draft MCQs) → `tools/build_content.py` → `content/items/*.json`
- ม.6: `tools/import_m6.mjs` imports the existing ม.6 banks AS-IS → `content/m6/`
- Seed: `tools/build_seed.py` → `supabase/seed.sql`
- Local stack (no Docker): `bash dev/local-stack/start.sh` → app http://127.0.0.1:8080/web/
- Tests: `bash tests/run_all.sh` (fresh local stack → RLS 58 → ม.6 import 12 → e2e 30)
- Go-live checklist: `docs/GO_LIVE.md`. Progress: `PROGRESS.md`
