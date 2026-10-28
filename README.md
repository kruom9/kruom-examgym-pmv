# Exam Gym ปิยมิตรมัธยม (ม.1–ม.6) · โรงเรียนปิยมิตรวิทยา

> **สถานะ: ฉบับทดลอง / ร่าง (draft, not yet open to students).**
> ข้อสอบ ม.1–ม.5 ทั้งหมด 1,074 ข้อ เป็น **ร่าง (Helix topic, draft)** ที่ยังรอครูผู้สอนตรวจทาน (รวม 45 ข้อที่ถูก flag ไว้) ข้อสอบจะยังเป็น `status='draft'` จนกว่าครูจะตรวจและเปลี่ยนเป็น `reviewed`
> All ม.1–ม.5 items are drafts pending teacher review. ม.6 items (827) are imported as-is from the existing ม.6 app; ม.6 students keep using the existing ม.6 app during the transition.

One static web app (`apps/web/`, one design system `assets/eg.css`) + one Supabase schema (`supabase/migrations`, `supabase/seed.sql`).
Hosted with GitHub Pages (root `index.html` redirects to `apps/web/`). The frontend holds only the public project URL + anon/publishable key; no secrets, rosters or personal data are stored in this repo.

- Content: `content/src/m1..m5.txt` (Helix Term 2 chapters, original draft MCQs) → `tools/build_content.py` → `content/items/*.json`
- ม.6: `tools/import_m6.mjs` imports the existing ม.6 banks AS-IS → `content/m6/`
- Seed: `tools/build_seed.py` → `supabase/seed.sql`
- Local stack (no Docker): `bash dev/local-stack/start.sh` → portal http://127.0.0.1:8080/web/ (local keys are served from `.local/config.js`, never committed)
- Tests: `bash tests/run_all.sh [--shots DIR]` (fresh local stack → RLS 58 → sections/dashboard RLS 57 → ม.6 import 12 → student e2e 30 → fake demo data → portal/dashboard e2e 36)

## Structure (2 ฝ่าย, one design system)
- `apps/web/` — portal: เลือกฝ่าย (มัธยม / ประถม) + link for staff
- `apps/web/mattayom/` — Exam Gym ปิยมิตรมัธยม: ม.1–ม.5 on Supabase; the ม.6 card links to the existing ม.6 system
- `apps/web/prathom/` — ฝ่ายประถม: ป.6 links to the existing live ป.6 system; ป.4/ป.5 "เร็ว ๆ นี้" (static, **not wired to any database**)
- `apps/web/dashboard/` — รายงานผู้บริหาร/ครู (teacher · director · admin only; rows limited by RLS `teaches_grade()`); pass threshold default 50% (assumption, adjustable)
- Shared: `assets/eg.css`, `js/eg-ui.js`; config: `apps/web/config.js` (public URL + publishable key only)

## Backend
- **มัธยม:** Supabase project `kruom-examgym-ms` (ref `flqejubdqeyynmkphcho`, ap-southeast-1, Free plan) — migrations 0100–0900 + `supabase/seed.sql`
- **ประถม:** the existing ป.6 project (`kruom-examgym-p6`) is **not touched** by this repo. `supabase/prathom/seed_prathom.sql` and migrations 0600–0900 are offered **for review** only.
- Manual step: Supabase Dashboard → Authentication → Sign In / Providers → **Anonymous sign-ins: ON** (students sign in anonymously; no connector can change this).
- Plan (Thai): `kruom_supabase_migration_plan.md` (kept outside the repo)
- Go-live checklist: `docs/GO_LIVE.md`. Progress: `PROGRESS.md`
