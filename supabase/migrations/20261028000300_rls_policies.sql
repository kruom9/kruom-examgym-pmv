-- =====================================================================
-- ExamGym · Row Level Security + grants
-- anon (no session)         : read catalogue only (grades, subjects, strands, exam_sets). No writes at all.
-- student (signed in, anon or password): read items; read ONLY own profile / attempts / answers;
--                              write only through register_student() / record_attempt() (or direct insert of own rows).
-- teacher (profiles.role='teacher'): read profiles / attempts / answers of the grade(s) they teach; read all items of that grade.
-- admin                      : read everything.
-- service_role / postgres    : bypass RLS (owner tools, seeding, migrations).
-- =====================================================================

alter table public.grades         enable row level security;
alter table public.subjects       enable row level security;
alter table public.strands        enable row level security;
alter table public.items          enable row level security;
alter table public.exam_sets      enable row level security;
alter table public.profiles       enable row level security;
alter table public.teacher_scopes enable row level security;
alter table public.attempts       enable row level security;
alter table public.answers        enable row level security;

-- ---------- grants: start from nothing, add the minimum ----------
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

grant usage on schema public to anon, authenticated;
grant select on public.grades, public.subjects, public.strands, public.exam_sets to anon, authenticated;
grant select on public.items, public.profiles, public.teacher_scopes, public.attempts, public.answers to authenticated;
grant insert on public.attempts, public.answers to authenticated;
-- column-level: a signed-in user may UPDATE only grade_code and room (of their own row, see policy below)
grant update (grade_code, room) on public.profiles to authenticated;

grant execute on function public.my_role()              to authenticated;
grant execute on function public.teaches_grade(text)    to authenticated;
grant execute on function public.nick_from_name(text)   to anon, authenticated;
grant execute on function public.register_student(text,text,text,boolean,text,text,text) to authenticated;
grant execute on function public.set_my_grade(text,text)   to authenticated;
grant execute on function public.record_attempt(jsonb)  to authenticated;
grant execute on function public.delete_my_data()       to authenticated;
-- grant_teacher(): owner only (SQL editor / service_role) — intentionally NOT granted to anon/authenticated.

-- ---------- catalogue ----------
create policy grades_read    on public.grades    for select to anon, authenticated using (true);
create policy subjects_read  on public.subjects  for select to anon, authenticated using (true);
create policy strands_read   on public.strands   for select to anon, authenticated using (true);
create policy exam_sets_read on public.exam_sets for select to anon, authenticated using (active or public.teaches_grade(grade_code));

-- ---------- items: any signed-in user reads live items; teachers also see retired items of their grade ----------
create policy items_read_live    on public.items for select to authenticated using (status in ('draft','reviewed','imported')
         and exists (select 1 from public.grades g where g.code = items.grade_code and g.status = 'live'));
create policy items_read_teacher on public.items for select to authenticated using (public.teaches_grade(grade_code));

-- ---------- profiles ----------
create policy profiles_read_own     on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_read_teacher on public.profiles for select to authenticated
  using (role = 'student' and public.teaches_grade(grade_code));
-- grade picker: update ONLY own row (columns limited to grade_code, room by the grant; values checked by profiles_bu trigger)
create policy profiles_update_own_grade on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
-- no insert/delete policies: students register via register_student(), teachers are promoted by the owner.

create policy teacher_scopes_read_own on public.teacher_scopes for select to authenticated using (teacher_id = (select auth.uid()));

-- ---------- attempts ----------
create policy attempts_read_own     on public.attempts for select to authenticated using (student_id = (select auth.uid()));
create policy attempts_read_teacher on public.attempts for select to authenticated using (public.teaches_grade(grade_code));
create policy attempts_insert_own   on public.attempts for insert to authenticated
  with check (student_id = (select auth.uid()));

-- ---------- answers ----------
create policy answers_read_own     on public.answers for select to authenticated using (student_id = (select auth.uid()));
create policy answers_read_teacher on public.answers for select to authenticated
  using (exists (select 1 from public.attempts a where a.id = answers.attempt_id and public.teaches_grade(a.grade_code)));
create policy answers_insert_own   on public.answers for insert to authenticated
  with check (student_id = (select auth.uid())
              and exists (select 1 from public.attempts a where a.id = answers.attempt_id and a.student_id = (select auth.uid())));
