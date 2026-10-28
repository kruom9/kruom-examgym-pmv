-- =====================================================================
-- Exam Gym · sections (มัธยม / ประถม), director role + section scopes,
-- roster-based identity (school student ID, never national ID),
-- legacy staging for one-time Sheet / Firestore imports.
-- Additive only: earlier migrations are not rewritten.
-- No roster, names or student data are inserted here.
-- =====================================================================

-- ---------- sections ----------
create table public.sections (
  code        text primary key check (code in ('mattayom','prathom')),
  name_th     text not null,                      -- 'มัธยม' / 'ประถม'
  app_name    text not null,                      -- 'Exam Gym ปิยมิตรมัธยม'
  app_path    text not null,                      -- 'mattayom/' (relative to apps/web/)
  sort        smallint not null default 0
);
comment on table public.sections is 'Exam Gym blocks sharing one design system. A grade belongs to exactly one section (derived from its code).';
insert into public.sections (code, name_th, app_name, app_path, sort) values
  ('mattayom', 'มัธยม', 'Exam Gym ปิยมิตรมัธยม', 'mattayom/', 1),
  ('prathom',  'ประถม', 'Exam Gym ปิยมิตรประถม', 'prathom/',  2)
on conflict (code) do nothing;

-- grades: allow ป.1–ป.6 codes; section is derived from the code (cannot drift)
alter table public.grades drop constraint if exists grades_code_check;
alter table public.grades add constraint grades_code_check check (code ~ '^(P[1-6]|M[1-6])$');
alter table public.grades add column section_code text
  generated always as (case when code like 'P%' then 'prathom' else 'mattayom' end) stored
  references public.sections(code);
create index grades_section_idx on public.grades (section_code, sort);

-- items: allow imported ป.6 bank later
alter table public.items drop constraint if exists items_origin_check;
alter table public.items add constraint items_origin_check check (origin in ('draft_original','imported_m6','imported_p6'));

-- ---------- roles: + director (reads every grade of the sections in scope) ----------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('student','teacher','director','admin'));

create table public.teacher_section_scopes (
  teacher_id   uuid not null references public.profiles(id) on delete cascade,
  section_code text not null references public.sections(code),
  primary key (teacher_id, section_code)
);
create index teacher_section_scopes_section_idx on public.teacher_section_scopes (section_code);

-- teaches_grade(): + director / section scopes (replaces the M3 definition; same signature)
create or replace function public.teaches_grade(g text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.role = 'admin'
           or (p.role in ('teacher','director') and (
                 p.grade_code = g
                 or exists (select 1 from public.teacher_scopes s where s.teacher_id = p.id and s.grade_code = g)
                 or exists (select 1 from public.teacher_section_scopes ss
                              join public.grades gr on gr.section_code = ss.section_code
                             where ss.teacher_id = p.id and gr.code = g))))
  )
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('teacher','director','admin'))
$$;

-- owner-only: promote an existing auth user (created in the dashboard) to director of a section
create or replace function public.grant_director(p_email text, p_section text, p_full_name text default 'ผู้บริหาร',
                                                 p_school text default 'โรงเรียนปิยมิตรวิทยา')
returns public.profiles language plpgsql security definer set search_path = '' as $$
declare v_uid uuid; v_row public.profiles;
begin
  select id into v_uid from auth.users where lower(email) = lower(p_email);
  if v_uid is null then raise exception 'no auth user with email %', p_email; end if;
  insert into public.profiles as p (id, role, grade_code, full_name, nick, school, consent, consent_at, login_kind)
  values (v_uid, 'director', null, p_full_name, public.nick_from_name(p_full_name), p_school, true, now(), 'password')
  on conflict (id) do update set role = 'director'
  returning * into v_row;
  insert into public.teacher_section_scopes (teacher_id, section_code) values (v_uid, p_section) on conflict do nothing;
  return v_row;
end $$;

-- ---------- roster-based identity (ม.6 student ID / ป.6 roster) ----------
-- Loaded only by the owner (service_role / SQL editor) after approval. Empty in this release.
create table public.roster_students (
  id            uuid primary key default gen_random_uuid(),
  grade_code    text not null references public.grades(code) on update cascade,
  room          text,                                   -- 'ม.6/1', 'ป.6/2'
  student_no    smallint,                               -- เลขที่
  student_code  text check (student_code is null or (student_code ~ '^[0-9A-Za-z-]{1,12}$' and student_code !~ '^\d{13}$')),
                                                        -- เลขประจำตัวนักเรียน (school ID; NEVER the 13-digit national ID)
  full_name     text not null check (length(btrim(full_name)) between 3 and 80 and full_name !~ '\d{13}'),
  name_key      text generated always as (lower(regexp_replace(regexp_replace(full_name,
                  '^\s*(เด็กชาย|เด็กหญิง|ด\.\s*ช\.?|ด\.\s*ญ\.?|นางสาว|น\.\s*ส\.|นาย|นาง)\s*', ''), '\s+', '', 'g'))) stored,
  status        text not null default 'active' check (status in ('active','moved','graduated')),
  source        text not null check (source in ('m6_roster','p6_roster','school_roster')),
  claimed_by    uuid unique references public.profiles(id) on delete set null,
  claimed_at    timestamptz,
  created_at    timestamptz not null default now(),
  unique (grade_code, student_code)
);
comment on table public.roster_students is 'Class lists (no national IDs, phones or photos). Students link their own profile with claim_roster(student_code, name). Teachers read their grades only.';
create index roster_students_grade_room_idx on public.roster_students (grade_code, room);
create index roster_students_name_idx on public.roster_students (grade_code, name_key);

create table public.roster_claim_failures (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  at         timestamptz not null default now()
);
create index roster_claim_failures_user_idx on public.roster_claim_failures (user_id, at desc);

-- student links own profile to a roster row: student_code AND name must match, row unclaimed, same grade.
-- 5 failed tries per hour per user (stops guessing student IDs).
create or replace function public.claim_roster(p_student_code text, p_full_name text)
returns table (room text, student_no smallint)
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_prof public.profiles; v_r public.roster_students; v_key text;
begin
  if v_uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select * into v_prof from public.profiles where id = v_uid;
  if not found or v_prof.role <> 'student' or v_prof.grade_code is null then
    raise exception 'register and pick your grade first' using errcode = '42501'; end if;
  if (select count(*) from public.roster_claim_failures f where f.user_id = v_uid and f.at > now() - interval '1 hour') >= 5 then
    raise exception 'too many tries, wait 1 hour' using errcode = '42501'; end if;
  v_key := lower(regexp_replace(regexp_replace(coalesce(p_full_name,''),
             '^\s*(เด็กชาย|เด็กหญิง|ด\.\s*ช\.?|ด\.\s*ญ\.?|นางสาว|น\.\s*ส\.|นาย|นาง)\s*', ''), '\s+', '', 'g'));
  select * into v_r from public.roster_students r
   where r.grade_code = v_prof.grade_code and r.student_code = btrim(coalesce(p_student_code,''))
     and r.name_key = v_key and r.status = 'active' and (r.claimed_by is null or r.claimed_by = v_uid);
  if not found then
    insert into public.roster_claim_failures (user_id) values (v_uid);
    raise exception 'no matching roster entry' using errcode = '22023';
  end if;
  update public.roster_students set claimed_by = v_uid, claimed_at = now() where id = v_r.id;
  return query select v_r.room, v_r.student_no;
end $$;

-- ---------- legacy staging (one-time imports; written only by the owner/service_role) ----------
create table public.legacy_import_batches (
  id           uuid primary key default gen_random_uuid(),
  source       text not null check (source in ('m6_sheet','m6_firestore','p6_sheet')),
  source_ref   text,                                 -- e.g. 'sheet:10iHW3…/tab:คำตอบ' (id prefix only)
  file_sha256  text check (file_sha256 is null or file_sha256 ~ '^[0-9a-f]{64}$'),
  dry_run      boolean not null default true,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  n_read       integer not null default 0,
  n_inserted   integer not null default 0,
  n_duplicate  integer not null default 0,
  n_rejected   integer not null default 0,
  note         text
);

create table public.legacy_people (
  id            uuid primary key default gen_random_uuid(),
  batch_id      uuid references public.legacy_import_batches(id) on delete set null,
  source        text not null check (source in ('m6_sheet','m6_firestore','p6_sheet')),
  source_key    text not null,                       -- ป.6 rid 'XG-…' · ม.6 student ID · Firestore doc id
  original_ts   timestamptz,                         -- registration time on the device / in the Sheet
  grade_code    text references public.grades(code) on update cascade,
  grade_text    text,
  room          text,
  full_name     text check (full_name is null or full_name !~ '\d{13}'),
  nick          text,
  school        text,
  line_id       text check (line_id is null or line_id ~ '^[A-Za-z0-9._@-]{1,30}$'),
  family_hash   text check (family_hash is null or family_hash ~ '^F[0-9a-f]{10}$'),  -- copied as-is; SALT is never copied
  consent       boolean,
  consent_text  text,
  roster_id     uuid references public.roster_students(id) on delete set null,
  profile_id    uuid references public.profiles(id) on delete set null,
  raw           jsonb not null default '{}'::jsonb,
  imported_at   timestamptz not null default now(),
  unique (source, source_key)
);

create table public.legacy_results (
  id             bigint generated always as identity primary key,
  batch_id       uuid references public.legacy_import_batches(id) on delete set null,
  source         text not null check (source in ('m6_sheet','m6_firestore','p6_sheet')),
  source_row_key text not null,                      -- ป.6 eid · ม.6 row hash
  original_ts    timestamptz,                        -- time on the device
  received_ts    timestamptz,                        -- time the Sheet received it
  person_key     text not null,                      -- = legacy_people.source_key
  grade_code     text references public.grades(code) on update cascade,
  subject_id     text references public.subjects(id) on update cascade,
  subject_text   text,
  topic_text     text,
  kind_text      text,                               -- ฝึก / สอบรายวิชา / สอบเสมือนจริง …
  level_text     text,
  n_correct      smallint check (n_correct is null or n_correct >= 0),
  n_total        smallint check (n_total is null or n_total >= 0),
  score_pct      numeric(5,1),
  pass_pct       smallint,
  passed         boolean,
  duration_s     integer,
  attempt_no     integer,
  exam_text      text,
  attempt_id     uuid references public.attempts(id) on delete set null,
  raw            jsonb not null default '{}'::jsonb,
  imported_at    timestamptz not null default now(),
  unique (source, source_row_key)
);

create table public.legacy_answers (
  id             bigint generated always as identity primary key,
  batch_id       uuid references public.legacy_import_batches(id) on delete set null,
  source         text not null check (source in ('m6_sheet','m6_firestore','p6_sheet')),
  source_row_key text not null,
  original_ts    timestamptz,
  person_key     text not null,
  grade_code     text references public.grades(code) on update cascade,
  legacy_item_id text,                               -- e.g. ม.6 '69-1'
  item_id        text references public.items(id) on update cascade,
  choice_index   smallint check (choice_index is null or choice_index between 0 and 4),
  is_correct     boolean,
  time_ms        integer check (time_ms is null or time_ms between 0 and 86400000),
  raw            jsonb not null default '{}'::jsonb,
  imported_at    timestamptz not null default now(),
  unique (source, source_row_key)
);
create index legacy_people_grade_idx   on public.legacy_people (grade_code);
create index legacy_people_batch_idx   on public.legacy_people (batch_id);
create index legacy_people_roster_idx  on public.legacy_people (roster_id);
create index legacy_people_profile_idx on public.legacy_people (profile_id);
create index legacy_results_person_idx on public.legacy_results (source, person_key);
create index legacy_results_grade_idx  on public.legacy_results (grade_code, original_ts);
create index legacy_results_batch_idx  on public.legacy_results (batch_id);
create index legacy_results_subject_idx on public.legacy_results (subject_id);
create index legacy_results_attempt_idx on public.legacy_results (attempt_id);
create index legacy_answers_person_idx on public.legacy_answers (source, person_key);
create index legacy_answers_grade_idx  on public.legacy_answers (grade_code);
create index legacy_answers_batch_idx  on public.legacy_answers (batch_id);
create index legacy_answers_item_idx   on public.legacy_answers (item_id);

-- ---------- RLS + grants for everything new ----------
alter table public.sections               enable row level security;
alter table public.teacher_section_scopes enable row level security;
alter table public.roster_students        enable row level security;
alter table public.roster_claim_failures  enable row level security;
alter table public.legacy_import_batches  enable row level security;
alter table public.legacy_people          enable row level security;
alter table public.legacy_results         enable row level security;
alter table public.legacy_answers         enable row level security;

revoke all on public.sections, public.teacher_section_scopes, public.roster_students, public.roster_claim_failures,
              public.legacy_import_batches, public.legacy_people, public.legacy_results, public.legacy_answers
  from anon, authenticated;
grant select on public.sections to anon, authenticated;
grant select on public.teacher_section_scopes, public.roster_students,
                public.legacy_people, public.legacy_results, public.legacy_answers, public.legacy_import_batches to authenticated;
-- roster_claim_failures: no grants at all (written only inside claim_roster)

create policy sections_read on public.sections for select to anon, authenticated using (true);
create policy teacher_section_scopes_read_own on public.teacher_section_scopes for select to authenticated
  using (teacher_id = (select auth.uid()));
create policy roster_read_teacher on public.roster_students for select to authenticated using (public.teaches_grade(grade_code));
create policy roster_read_own     on public.roster_students for select to authenticated using (claimed_by = (select auth.uid()));
create policy legacy_people_read_teacher  on public.legacy_people  for select to authenticated using (public.teaches_grade(grade_code));
create policy legacy_results_read_teacher on public.legacy_results for select to authenticated using (public.teaches_grade(grade_code));
create policy legacy_answers_read_teacher on public.legacy_answers for select to authenticated using (public.teaches_grade(grade_code));
create policy legacy_batches_read_admin   on public.legacy_import_batches for select to authenticated using (public.my_role() = 'admin');
create policy roster_claim_failures_none  on public.roster_claim_failures for select to authenticated using (false);

revoke execute on function public.grant_director(text,text,text,text) from public, anon, authenticated;
revoke execute on function public.claim_roster(text,text) from public, anon;
grant  execute on function public.claim_roster(text,text) to authenticated;
revoke execute on function public.is_staff() from public, anon;
grant  execute on function public.is_staff() to authenticated;
