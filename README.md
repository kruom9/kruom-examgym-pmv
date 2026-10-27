# Exam Gym ปิยมิตรมัธยม (ม.1–ม.6), local build

One static web app (`apps/web/`, one design system `assets/eg.css`) + one Supabase schema (`supabase/migrations`, `supabase/seed.sql`).
LOCAL ONLY. Not pushed, not deployed, no cloud project.

- Content: `content/src/m1..m5.txt` (Helix Term 2 chapters, original draft MCQs) → `tools/build_content.py` → `content/items/*.json`
- ม.6: `tools/import_m6.mjs` imports the existing ม.6 banks AS-IS (commit 5620e4c) → `content/m6/`
- Seed: `tools/build_seed.py` → `supabase/seed.sql`
- Local stack (no Docker): `bash dev/local-stack/start.sh` → app http://127.0.0.1:8080/web/
- Tests: `bash tests/run_all.sh` (fresh stack → RLS 58 → ม.6 import 12 → e2e 30), screenshots `tests/shots_grades.py DIR`
- Review output: `tools/contact_sheet.py`, `tools/make_pdfs.py`
- Go-live: `docs/GO_LIVE.md`. Progress: `PROGRESS.md`
