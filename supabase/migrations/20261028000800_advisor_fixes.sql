-- =====================================================================
-- Exam Gym · fixes from the Supabase security + performance advisors (kruom-examgym-ms, 2026-10-28)
-- * merge the two permissive SELECT policies per table into ONE (same rows visible; one evaluation)
-- * cover the remaining foreign keys with indexes
-- * SECURITY DEFINER RPCs that are meant to be called are documented (lint 0028/0029 accepted):
--     register_student / set_my_grade / delete_my_data / record_attempt / claim_roster — act only on auth.uid()'s own rows
--     my_role / is_staff / teaches_grade — return facts about the caller only; needed by RLS policies
--     bank_counts — aggregate item counts per strand (no item text, no answers); shown before sign-in
-- =====================================================================

drop policy if exists items_read_live    on public.items;
drop policy if exists items_read_teacher on public.items;
create policy items_read on public.items for select to authenticated using (
  (status in ('draft','reviewed','imported')
     and exists (select 1 from public.grades g where g.code = items.grade_code and g.status = 'live'))
  or public.teaches_grade(grade_code));

drop policy if exists profiles_read_own     on public.profiles;
drop policy if exists profiles_read_teacher on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (
  id = (select auth.uid()) or (role = 'student' and public.teaches_grade(grade_code)));

drop policy if exists attempts_read_own     on public.attempts;
drop policy if exists attempts_read_teacher on public.attempts;
create policy attempts_read on public.attempts for select to authenticated using (
  student_id = (select auth.uid()) or public.teaches_grade(grade_code));

drop policy if exists answers_read_own     on public.answers;
drop policy if exists answers_read_teacher on public.answers;
create policy answers_read on public.answers for select to authenticated using (
  student_id = (select auth.uid())
  or exists (select 1 from public.attempts a where a.id = answers.attempt_id and public.teaches_grade(a.grade_code)));

drop policy if exists roster_read_own     on public.roster_students;
drop policy if exists roster_read_teacher on public.roster_students;
create policy roster_read on public.roster_students for select to authenticated using (
  claimed_by = (select auth.uid()) or public.teaches_grade(grade_code));

create index if not exists attempts_strand_idx     on public.attempts (strand_id);
create index if not exists attempts_subject_idx    on public.attempts (subject_id);
create index if not exists exam_sets_grade_idx     on public.exam_sets (grade_code);
create index if not exists exam_sets_subject_idx   on public.exam_sets (subject_id);
create index if not exists items_strand_idx        on public.items (strand_id);
create index if not exists items_subject_idx       on public.items (subject_id);
create index if not exists strands_grade_idx       on public.strands (grade_code);

comment on function public.bank_counts() is 'Public on purpose: item counts per strand only (no stems, no answers). Advisor 0028 accepted.';
comment on function public.my_role() is 'Caller''s own role; used by RLS. Advisor 0029 accepted.';
comment on function public.is_staff() is 'Is the caller teacher/director/admin; used by dashboard RPCs. Advisor 0029 accepted.';
comment on function public.teaches_grade(text) is 'Does the caller teach grade g (grade, grade scope or section scope); used by RLS. Advisor 0029 accepted.';
