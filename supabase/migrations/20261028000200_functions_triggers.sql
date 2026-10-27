-- =====================================================================
-- ExamGym · helper functions, registration RPC, server-side scoring
-- =====================================================================

-- ---------- role helpers (SECURITY DEFINER so RLS policies can call them without recursion) ----------
create or replace function public.my_role()
returns text language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p where p.id = auth.uid()
$$;

create or replace function public.teaches_grade(g text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.role = 'admin'
           or (p.role = 'teacher' and (p.grade_code = g
                 or exists (select 1 from public.teacher_scopes s where s.teacher_id = p.id and s.grade_code = g))))
  )
$$;

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

create trigger items_updated_at    before update on public.items    for each row execute function public.set_updated_at();
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();

-- ---------- nickname from full name (same idea as ป.6 nickFromName) ----------
create or replace function public.nick_from_name(p_name text)
returns text language sql immutable set search_path = '' as $$
  select coalesce(nullif(split_part(btrim(regexp_replace(coalesce(p_name,''),
           '^\s*(เด็กชาย|เด็กหญิง|ด\.ช\.|ด\.ญ\.|นางสาว|น\.ส\.|นาย|นาง)\s*', '')), ' ', 1), ''), btrim(p_name))
$$;

-- ---------- registration: called right after supabase.auth.signInAnonymously() ----------
-- The shared ExamGym does NOT default to any grade: the profile is created with grade_code = NULL,
-- and the app then shows the grade picker (ม.1–ม.6). See set_my_grade().
create or replace function public.register_student(
  p_full_name   text,
  p_school      text,
  p_line_id     text,
  p_consent     boolean,
  p_school_code text default null,
  p_src         text default null,
  p_consent_version text default 'examgym-2026-10'
) returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := auth.uid();
  v_name  text := btrim(regexp_replace(coalesce(p_full_name,''), '\s+', ' ', 'g'));
  v_school text := btrim(coalesce(p_school,''));
  v_line  text := btrim(coalesce(p_line_id,''));
  v_row   public.profiles;
begin
  if v_uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if coalesce(p_consent,false) is not true then raise exception 'consent required' using errcode = '22023'; end if;
  if length(v_name) < 3 or length(v_name) > 80 then raise exception 'invalid name' using errcode = '22023'; end if;
  if length(v_school) < 2 or length(v_school) > 120 then raise exception 'invalid school' using errcode = '22023'; end if;
  if v_line !~ '^[A-Za-z0-9._@-]{1,30}$' then raise exception 'invalid LINE ID' using errcode = '22023'; end if;
  -- never store a 13-digit (ID-card-like) number anywhere
  if (v_name || ' ' || v_school || ' ' || v_line) ~ '\d{13}' then
    raise exception 'ID-card-like number not allowed' using errcode = '22023'; end if;

  insert into public.profiles as p (id, role, grade_code, full_name, nick, school, school_code, line_id,
                                    consent, consent_at, consent_version, login_kind, src)
  values (v_uid, 'student', null, v_name, public.nick_from_name(v_name), v_school,
          nullif(btrim(coalesce(p_school_code,'')),''), v_line, true, now(), p_consent_version,
          case when coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then 'anonymous' else 'password' end,
          nullif(left(regexp_replace(coalesce(p_src,''), '[^A-Za-z0-9_-]', '', 'g'), 20), ''))
  on conflict (id) do update
     set full_name = excluded.full_name, nick = excluded.nick, school = excluded.school,
         school_code = excluded.school_code, line_id = excluded.line_id,
         consent = true, consent_at = now(), consent_version = excluded.consent_version
         -- role and grade are never changed here
  returning * into v_row;
  return v_row;
end $$;

-- ---------- grade picker: a student sets / changes ONLY their own grade (+ room) ----------
-- Guard trigger: whoever updates a profile row (direct UPDATE through RLS or this RPC),
-- a non-owner session may change only grade_code/room, only to a LIVE grade, with a valid room.
create or replace function public.profiles_before_update()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_grade public.grades;
begin
  if auth.uid() is null then return new; end if;   -- owner / service_role / SQL editor
  if new.id <> old.id or new.role <> old.role or new.login_kind <> old.login_kind
     or new.legacy_student_id is distinct from old.legacy_student_id then
    raise exception 'only grade and room can be changed here' using errcode = '42501'; end if;
  if new.grade_code is distinct from old.grade_code or new.room is distinct from old.room then
    if new.grade_code is null then
      new.room := null;
    else
      select * into v_grade from public.grades where code = new.grade_code;
      if not found or v_grade.status <> 'live' then
        raise exception 'grade % is not open in this app yet', new.grade_code using errcode = '22023'; end if;
      if new.room is null or new.room !~ ('^' || replace(v_grade.name_th, '.', '\.') || '(/([1-9]|1[0-9]|20))?$')
         or coalesce(nullif(split_part(new.room, '/', 2), '')::int, 0) > v_grade.room_max then
        raise exception 'invalid room % for %', new.room, v_grade.name_th using errcode = '22023'; end if;
    end if;
    new.grade_chosen_at := now();
  end if;
  return new;
end $$;
create trigger profiles_bu before update on public.profiles for each row execute function public.profiles_before_update();

-- convenience RPC (SECURITY INVOKER → RLS + column grants + the trigger above all apply)
create or replace function public.set_my_grade(p_grade_code text, p_room text)
returns public.profiles language plpgsql security invoker set search_path = '' as $$
declare v_row public.profiles;
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  update public.profiles set grade_code = p_grade_code, room = p_room
   where id = auth.uid()
  returning * into v_row;
  if v_row.id is null then raise exception 'register first' using errcode = '42501'; end if;
  return v_row;
end $$;

-- ---------- PDPA: student deletes own data (profile → attempts → answers cascade) ----------
create or replace function public.delete_my_data()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  delete from public.profiles where id = auth.uid() and role = 'student';
end $$;

-- ---------- owner-only: promote an existing auth user (created in the dashboard) to teacher ----------
create or replace function public.grant_teacher(p_email text, p_grade_code text, p_full_name text default 'ครู',
                                                p_school text default 'โรงเรียนปิยมิตรวิทยา')
returns public.profiles language plpgsql security definer set search_path = '' as $$
declare v_uid uuid; v_row public.profiles;
begin
  select id into v_uid from auth.users where lower(email) = lower(p_email);
  if v_uid is null then raise exception 'no auth user with email %', p_email; end if;
  insert into public.profiles as p (id, role, grade_code, full_name, nick, school, consent, consent_at, login_kind)
  values (v_uid, 'teacher', p_grade_code, p_full_name, public.nick_from_name(p_full_name), p_school, true, now(), 'password')
  on conflict (id) do update set role = 'teacher', grade_code = excluded.grade_code
  returning * into v_row;
  return v_row;
end $$;

-- ---------- attempts: validate on insert; counters are server-maintained ----------
create or replace function public.attempts_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_prof public.profiles; v_set public.exam_sets;
begin
  if auth.uid() is not null then new.student_id := auth.uid(); end if;
  select * into v_prof from public.profiles where id = new.student_id;
  if not found then raise exception 'register first' using errcode = '42501'; end if;
  if v_prof.role = 'student' and (v_prof.grade_code is null or new.grade_code is distinct from v_prof.grade_code) then
    raise exception 'grade mismatch (pick your grade first)' using errcode = '42501'; end if;
  if new.exam_set_id is not null then
    select * into v_set from public.exam_sets where id = new.exam_set_id;
    if not found or v_set.grade_code <> new.grade_code or v_set.kind <> new.kind then
      raise exception 'exam set mismatch' using errcode = '22023'; end if;
  end if;
  new.n_items := 0; new.n_correct := 0; new.score_pct := 0; new.passed := false;
  new.created_at := now();
  return new;
end $$;
create trigger attempts_bi before insert on public.attempts for each row execute function public.attempts_before_insert();

-- answers: correctness comes from items.answer_index, never from the client
create or replace function public.answers_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_att public.attempts; v_item public.items;
begin
  select * into v_att from public.attempts where id = new.attempt_id;
  if not found then raise exception 'attempt not found' using errcode = '22023'; end if;
  if auth.uid() is not null and v_att.student_id <> auth.uid() then
    raise exception 'not your attempt' using errcode = '42501'; end if;
  select * into v_item from public.items where id = new.item_id;
  if not found or v_item.grade_code <> v_att.grade_code then
    raise exception 'item not in this grade' using errcode = '22023'; end if;
  new.student_id := v_att.student_id;
  new.is_correct := (new.choice_index is not null and new.choice_index = any(v_item.answer_keys));
  new.created_at := now();
  return new;
end $$;
create trigger answers_bi before insert on public.answers for each row execute function public.answers_before_insert();

create or replace function public.answers_after_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.attempts a
     set n_items   = s.n,
         n_correct = s.c,
         score_pct = case when s.n > 0 then round(100.0 * s.c / s.n) else 0 end,
         passed    = s.n > 0 and round(100.0 * s.c / s.n) >=
                     coalesce((select e.pass_pct from public.exam_sets e where e.id = a.exam_set_id), 70)
    from (select x.attempt_id, count(*)::smallint as n, (count(*) filter (where x.is_correct))::smallint as c
            from public.answers x
           where x.attempt_id in (select distinct r.attempt_id from new_rows r)
           group by x.attempt_id) s
   where a.id = s.attempt_id;
  return null;
end $$;
create trigger answers_ai after insert on public.answers
  referencing new table as new_rows for each statement execute function public.answers_after_insert();

-- ---------- one-call save of a finished practice round / test (SECURITY INVOKER → RLS applies) ----------
-- p = { client_attempt_id, grade_code, kind, exam_set_id?, subject_id?, strand_id?, started_at (ISO), submitted_at (ISO),
--       duration_s, auto_submitted, attempt_no, shuffle_seed?, meta?,
--       answers: [ { item_id, position, choice_index|null, time_ms, unsure, level_at, display_order? } ] }
-- Idempotent: re-sending the same client_attempt_id returns the stored attempt (offline queue retries are safe).
create or replace function public.record_attempt(p jsonb)
returns public.attempts language plpgsql security invoker set search_path = '' as $$
declare v_att public.attempts; v_new boolean := false;
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if jsonb_typeof(p -> 'answers') is distinct from 'array' or jsonb_array_length(p -> 'answers') = 0
     or jsonb_array_length(p -> 'answers') > 200 then
    raise exception 'answers must be a non-empty array (max 200)' using errcode = '22023'; end if;

  select * into v_att from public.attempts
   where student_id = auth.uid() and client_attempt_id = p ->> 'client_attempt_id';
  if found then return v_att; end if;

  insert into public.attempts (student_id, grade_code, kind, exam_set_id, subject_id, strand_id, client_attempt_id,
                               attempt_no, started_at, submitted_at, duration_s, auto_submitted, shuffle_seed, meta)
  values (auth.uid(), p ->> 'grade_code', p ->> 'kind', nullif(p ->> 'exam_set_id',''), nullif(p ->> 'subject_id',''),
          nullif(p ->> 'strand_id',''), p ->> 'client_attempt_id', nullif(p ->> 'attempt_no','')::smallint,
          coalesce((p ->> 'started_at')::timestamptz, now()), coalesce((p ->> 'submitted_at')::timestamptz, now()),
          nullif(p ->> 'duration_s','')::integer, coalesce((p ->> 'auto_submitted')::boolean, false),
          nullif(p ->> 'shuffle_seed','')::bigint, coalesce(p -> 'meta', '{}'::jsonb))
  returning * into v_att;

  insert into public.answers (attempt_id, item_id, position, choice_index, time_ms, unsure, level_at, display_order)
  select v_att.id, a ->> 'item_id', (a ->> 'position')::smallint, nullif(a ->> 'choice_index','')::smallint,
         nullif(a ->> 'time_ms','')::integer, coalesce((a ->> 'unsure')::boolean, false),
         nullif(a ->> 'level_at','')::smallint,
         case when jsonb_typeof(a -> 'display_order') = 'array'
              then array(select jsonb_array_elements_text(a -> 'display_order')::smallint) end
    from jsonb_array_elements(p -> 'answers') a;

  select * into v_att from public.attempts where id = v_att.id;
  return v_att;
end $$;
