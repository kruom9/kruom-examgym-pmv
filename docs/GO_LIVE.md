# Exam Gym ปิยมิตรมัธยม: go-live checklist (DEFERRED, nothing here has been done)

Everything in this repo runs locally only. Nothing has been pushed, deployed, or created in the cloud.

## 1. Owner approvals (before anything goes live)
- [ ] ผอ./ฝ่ายวิชาการ approve: student data collected = ชื่อ, โรงเรียน, ห้อง, LINE ID + answers/time (PDPA consent text `examgym-2026-10`); registration is 3 fields + consent (differs from ป.6)
- [ ] Teachers review the 1074 Helix draft items (PDFs in examgym_review/pdf), especially the 45 flagged ones. Drafts stay `status='draft'` until marked `reviewed`
- [ ] ม.1 ส21103: ผังการเรียน vs Helix Documents conflict. Confirm which chapter list is correct
- [ ] Fill content marked ยังต้องเติม: ม.6 คณิต (no bank in the existing ม.6 app, no Term 2 Helix data)

## 2. Supabase (account **piyamit-academic**, created by the owner, not by an agent)
- [ ] Create project "ExamGym" (region Singapore). Free plan limits: 500 MB DB, 50k MAU, pauses after 7 days idle (upgrade to Pro before term starts if it must not pause)
- [ ] Auth: enable Anonymous sign-ins, set rate limits, turn on CAPTCHA (Turnstile/hCaptcha) for anonymous sign-ups, set Site URL to the hosting URL
- [ ] Apply `supabase/migrations/*.sql` in order, then `supabase/seed.sql` (SQL editor or `supabase db push`)
- [ ] Create teacher users in the dashboard, then run `select public.grant_teacher('<email>','M1','<ชื่อครู>');` per grade
- [ ] Put the project URL + **anon** key into `apps/web/config.js` on the host (git-ignored; never the service_role key)

## 3. Hosting
- [ ] Static host for `apps/web/` (e.g. GitHub Pages on a new repo under kruom9, or Supabase/Cloudflare Pages). Needs an owner decision. No repo was created
- [ ] Custom domain / HTTPS (optional)

## 4. ม.6 (deferred)
- [ ] Students keep using the existing ม.6 app (https://kruom9.github.io/kruom-cefr/examgym/m6-ios/) via the transition link
- [ ] Account migration: Firebase password hashes cannot be imported. Students must re-register (anonymous + profile) or the owner exports a list of names only
- [ ] Copying old Google Sheet answers into `attempts/answers`: needs owner export + approval (not done; no Sheet was read)

## 5. After launch
- [ ] Run `tests/rls_test.py` against a staging project (change API/keys) before opening to students
- [ ] Turn on daily backups / PITR if on Pro
