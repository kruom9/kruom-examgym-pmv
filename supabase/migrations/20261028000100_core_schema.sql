-- =====================================================================
-- ExamGym · core schema (multi-grade ม.1–ม.6)
-- โรงเรียนปิยมิตรวิทยา ฝ่ายมัธยม · อ.เชียงคำ จ.พะเยา
-- One Supabase project for every grade. ม.1 is the first grade loaded;
-- ม.6 (currently Firebase + Apps Script) can be migrated later: see the
-- login_kind / legacy_* / shuffle_seed / display_order columns.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------- catalogue ----------
create table public.grades (
  code        text primary key check (code ~ '^M[1-6]$'),      -- 'M1'..'M6'
  name_th     text not null,                                   -- 'ม.1'
  app_name    text,                                            -- 'Exam Gym ม.1'
  sort        smallint not null,
  status      text not null default 'coming_soon'
              check (status in ('live','coming_soon','external')),  -- live = content in this project
                                                                     -- external = still on its old app (ม.6 → Firebase app)
  external_url text,                                           -- link-out while status = 'external'
  app_path    text,                                            -- where the grade's app lives in this project (null = built into the shell)
  room_max    smallint not null default 10,                    -- rooms offered: 'ม.x' (single room) and 'ม.x/1'..'ม.x/room_max'
  created_at  timestamptz not null default now(),
  check (status <> 'external' or external_url is not null)
);
comment on table public.grades is 'ระดับชั้น ม.1–ม.6 shown on the grade picker. Only status=live grades can be chosen inside the project.';

create table public.subjects (
  id          text primary key,                                -- 'M1-MA'
  grade_code  text not null references public.grades(code) on update cascade,
  code        text not null,                                   -- 'MA','SC','EN','TH','SO'
  name_th     text not null,
  icon        text,
  color       text,
  course_codes text[] not null default '{}',                   -- รหัสวิชาเทอม 2 from Helix, e.g. {ค21102,ค21202}
  status      text not null default 'live' check (status in ('live','needs_content','imported')),
                                                               -- needs_content = 'ยังต้องเติม' shell (no Helix data yet)
  note        text,
  sort        smallint not null default 0,
  unique (grade_code, code)
);

create table public.strands (
  id           text primary key,                               -- 'M1-MA-1.1'  (one practice topic)
  subject_id   text not null references public.subjects(id) on update cascade on delete cascade,
  grade_code   text not null references public.grades(code) on update cascade,
  code         text not null,                                  -- '1.1'
  name_th      text not null,
  group_no     smallint not null,                              -- สาระ/หน่วย number (= chapter in the app)
  group_name   text not null,                                  -- e.g. 'สาระที่ 1 จำนวนและพีชคณิต'
  indicators   text,                                           -- ตัวชี้วัด e.g. 'ค 1.1 ม.1/1'
  concepts     jsonb not null default '[]'::jsonb check (jsonb_typeof(concepts) = 'array'),
  course_code  text,
  term         smallint,
  source       text,                                           -- 'Helix (topic_survey_by_grade)' / 'ม.6 bank sara'
  status       text not null default 'live' check (status in ('live','needs_content','term_unverified')),
  sort         smallint not null default 0,
  unique (subject_id, code)
);

create table public.items (
  id             text primary key,                             -- 'M1-MA-T03-07' (draft) · 'M6-BI-69-1' (imported ม.6)
  grade_code     text not null references public.grades(code) on update cascade,
  subject_id     text not null references public.subjects(id) on update cascade,
  strand_id      text not null references public.strands(id) on update cascade,
  course_code    text,                                         -- รหัสวิชา e.g. 'ค21102' (from Helix) or exam code 'A-Level 66'
  term           smallint check (term in (1,2)),               -- this release = term 2 content only
  difficulty     smallint not null check (difficulty between 0 and 3), -- 0 ตั้งไข่ 1 ง่าย 2 กลาง 3 ยาก
  stem           text not null check (length(stem) between 3 and 6000),
  choices        jsonb not null check (jsonb_typeof(choices) = 'array' and jsonb_array_length(choices) between 2 and 5),
  answer_index   smallint not null check (answer_index between 0 and 4),   -- primary correct choice (ORIGINAL order, 0-based)
  answer_keys    smallint[] not null,                                      -- all accepted choices (ม.6 ทปอ. items can have >1)
  hint           text,
  explanation    jsonb not null default '[]'::jsonb check (jsonb_typeof(explanation) = 'array'),
  choice_notes   jsonb,                                        -- per-choice explanation (ม.6 banks)
  media          jsonb,                                        -- {img: 'legacy path', table: [...]} (ม.6 banks)
  origin         text not null default 'draft_original'
                 check (origin in ('draft_original','imported_m6')),
  status         text not null default 'draft' check (status in ('draft','reviewed','imported','retired')),
  no_shuffle     boolean not null default false,               -- keep choice order (e.g. 'ทั้ง ก และ ข')
  source_label   text not null default 'Helix topic, draft',
  review_flag    text,                                          -- author's doubt / note for the reviewing teacher
  exam_year      smallint,                                      -- ม.6 imported items: พ.ศ. of the ทปอ. paper
  reviewed_by    uuid,
  reviewed_at    timestamptz,
  legacy_id      text,                                          -- id in the source bank (ม.6 migration)
  version        integer not null default 1,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (answer_index < jsonb_array_length(choices)),
  check (answer_index = any(answer_keys) and cardinality(answer_keys) between 1 and 5)
);
comment on column public.items.answer_keys is '0-based indexes of every accepted choice in the ORIGINAL order; correctness is computed server-side from this.';

-- mock / subject-room / practice configs (modelled on ป.6 RULES)
create table public.exam_sets (
  id             text primary key,                             -- 'M1-ROOM-MA', 'M1-MOCK'
  grade_code     text not null references public.grades(code) on update cascade,
  subject_id     text references public.subjects(id) on update cascade, -- null = all subjects (mock)
  kind           text not null check (kind in ('practice','subject_room','mock')),
  name_th        text not null,
  n_items        smallint not null check (n_items > 0),
  per_subject    smallint,                                      -- mock: items per subject
  minutes        smallint,                                      -- null = untimed
  mix            jsonb not null default '[0,0,0,0]'::jsonb,     -- items per difficulty [L0,L1,L2,L3]
  max_attempts   smallint,
  pass_pct       smallint not null default 70,
  unlock_rule    jsonb not null default '{}'::jsonb,
  shuffle_choices boolean not null default false,               -- ม.1 v1 = false (like ป.6); ม.6 = true
  active         boolean not null default true,
  sort           smallint not null default 0
);

-- ---------- people ----------
create table public.profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  role              text not null default 'student' check (role in ('student','teacher','admin')),
  grade_code        text references public.grades(code) on update cascade,  -- = grade id; NULL = not chosen yet → show the grade picker
  grade_chosen_at   timestamptz,
  full_name         text not null check (length(btrim(full_name)) between 3 and 80),
  nick              text,
  school            text not null check (length(btrim(school)) between 2 and 120),
  school_code       text,
  room              text,                                         -- 'ม.1', 'ม.1/1' … 'ม.1/10' (set together with grade_code)
  line_id           text check (line_id is null or line_id ~ '^[A-Za-z0-9._@-]{1,30}$'),
  consent           boolean not null default false,
  consent_at        timestamptz,
  consent_version   text,
  login_kind        text not null default 'anonymous' check (login_kind in ('anonymous','password','email','migrated')),
  legacy_student_id text unique,                                  -- e.g. ม.6 student ID (ID/password login later)
  legacy_source     text,                                         -- 'firebase-m6'
  src               text,                                         -- ?src= campaign tag
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
comment on table public.profiles is 'One row per auth user. Students self-register via register_student() (no grade), then pick their grade on the picker (set_my_grade / own-row UPDATE of grade_code, room). Teachers are promoted by the owner via grant_teacher().';

-- extra grades a teacher may read (besides profiles.grade_code)
create table public.teacher_scopes (
  teacher_id  uuid not null references public.profiles(id) on delete cascade,
  grade_code  text not null references public.grades(code) on update cascade,
  primary key (teacher_id, grade_code)
);

-- ---------- results ----------
create table public.attempts (
  id                 uuid primary key default gen_random_uuid(),
  student_id         uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  grade_code         text not null references public.grades(code) on update cascade,
  kind               text not null check (kind in ('practice','subject_room','mock')),
  exam_set_id        text references public.exam_sets(id) on update cascade,
  subject_id         text references public.subjects(id) on update cascade,
  strand_id          text references public.strands(id) on update cascade,   -- practice target topic
  client_attempt_id  text not null check (length(client_attempt_id) between 6 and 80), -- idempotency key from the device
  attempt_no         smallint,
  started_at         timestamptz not null default now(),
  submitted_at       timestamptz,
  duration_s         integer check (duration_s is null or duration_s between 0 and 86400),
  auto_submitted     boolean not null default false,
  shuffle_seed       bigint,                                       -- per-attempt choice-shuffle seed (ม.6 style)
  -- the next four are maintained by trigger from answers (never trusted from the client)
  n_items            smallint not null default 0,
  n_correct          smallint not null default 0,
  score_pct          smallint not null default 0,
  passed             boolean not null default false,
  meta               jsonb not null default '{}'::jsonb,
  legacy_source      text,
  legacy_id          text,
  created_at         timestamptz not null default now(),
  unique (student_id, client_attempt_id)
);

create table public.answers (
  id             bigint generated always as identity primary key,
  attempt_id     uuid not null references public.attempts(id) on delete cascade,
  student_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  item_id        text not null references public.items(id) on update cascade,
  position       smallint not null check (position between 0 and 199),
  choice_index   smallint check (choice_index is null or choice_index between 0 and 4), -- ORIGINAL index; null = skipped
  display_order  smallint[],                                       -- shown order of original indexes (if shuffled)
  is_correct     boolean not null default false,                   -- set by trigger from items.answer_index
  time_ms        integer check (time_ms is null or time_ms between 0 and 86400000),
  unsure         boolean not null default false,
  level_at       smallint check (level_at is null or level_at between 0 and 3),
  created_at     timestamptz not null default now(),
  unique (attempt_id, position)
);

-- ---------- indexes ----------
create index items_bank_idx        on public.items (grade_code, subject_id, strand_id, difficulty) where status <> 'retired';
create index items_status_idx      on public.items (grade_code, status);
create index strands_subject_idx   on public.strands (subject_id, sort);
create index subjects_grade_idx    on public.subjects (grade_code, sort);
create index profiles_grade_room_idx on public.profiles (grade_code, room) where role = 'student';
create index profiles_school_idx   on public.profiles (school);
create index attempts_student_idx  on public.attempts (student_id, started_at desc);
create index attempts_grade_kind_idx on public.attempts (grade_code, kind, started_at desc);
create index attempts_exam_set_idx on public.attempts (exam_set_id);
create index answers_attempt_idx   on public.answers (attempt_id);
create index answers_student_idx   on public.answers (student_id, created_at desc);
create index answers_item_idx      on public.answers (item_id);
create index teacher_scopes_grade_idx on public.teacher_scopes (grade_code);
