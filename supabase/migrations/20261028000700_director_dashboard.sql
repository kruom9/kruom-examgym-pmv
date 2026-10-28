-- =====================================================================
-- Exam Gym · director / teacher reporting (RLS-scoped)
-- One base view (security_invoker → caller's RLS) + filtered RPCs (security invoker).
-- Only teacher / director / admin sessions get rows (is_staff()); students get nothing.
-- Dates are bucketed in Asia/Bangkok. Pass threshold is a parameter (default 50%).
-- Filters (all optional): p_section, p_grade, p_subject, p_from, p_to (Bangkok dates, inclusive), p_kind.
-- =====================================================================

create view public.v_dash_attempts with (security_invoker = true) as
select a.id                    as attempt_id,
       gr.section_code,
       a.grade_code,
       p.room,
       p.school,
       a.student_id,
       p.full_name,
       p.nick,
       a.kind,
       a.exam_set_id,
       coalesce(a.subject_id, '')   as subject_id,      -- '' = mock (all subjects)
       coalesce(sj.name_th, 'รวมทุกวิชา (สอบเสมือนจริง)') as subject_name,
       a.n_items, a.n_correct, a.score_pct, a.passed, a.duration_s,
       coalesce(a.submitted_at, a.started_at) as at,
       (coalesce(a.submitted_at, a.started_at) at time zone 'Asia/Bangkok')::date as day_bkk
  from public.attempts a
  join public.profiles p  on p.id = a.student_id and p.role = 'student'
  join public.grades gr   on gr.code = a.grade_code
  left join public.subjects sj on sj.id = a.subject_id
 where a.n_items > 0;

create or replace function public.dash_filtered(p_section text, p_grade text, p_subject text, p_from date, p_to date, p_kind text)
returns setof public.v_dash_attempts language sql stable security invoker set search_path = '' as $$
  select v.* from public.v_dash_attempts v
   where public.is_staff()
     and (p_section is null or p_section = '' or v.section_code = p_section)
     and (p_grade   is null or p_grade   = '' or v.grade_code   = p_grade)
     and (p_subject is null or p_subject = '' or v.subject_id   = p_subject)
     and (p_kind    is null or p_kind    = '' or v.kind         = p_kind)
     and (p_from is null or v.day_bkk >= p_from)
     and (p_to   is null or v.day_bkk <= p_to)
$$;

-- 1) student list per grade / room (every registered student in scope, with activity in the window)
create or replace function public.dash_students(p_section text default null, p_grade text default null, p_subject text default null,
                                                p_from date default null, p_to date default null, p_kind text default null)
returns table (section_code text, grade_code text, room text, student_id uuid, full_name text, nick text, school text,
               registered_at timestamptz, n_attempts bigint, avg_pct numeric, best_pct smallint, last_active timestamptz)
language sql stable security invoker set search_path = '' as $$
  select gr.section_code, p.grade_code, p.room, p.id, p.full_name, p.nick, p.school, p.created_at,
         count(f.attempt_id), round(avg(f.score_pct), 1), max(f.score_pct), max(f.at)
    from public.profiles p
    join public.grades gr on gr.code = p.grade_code
    left join public.dash_filtered(p_section, p_grade, p_subject, p_from, p_to, p_kind) f on f.student_id = p.id
   where public.is_staff() and p.role = 'student'
     and (p_section is null or p_section = '' or gr.section_code = p_section)
     and (p_grade is null or p_grade = '' or p.grade_code = p_grade)
   group by gr.section_code, gr.sort, p.grade_code, p.room, p.id
   order by gr.sort, p.room nulls last, p.full_name
$$;

-- 2) scores per subject: average, median, min, max, attempts, students
create or replace function public.dash_subject_scores(p_section text default null, p_grade text default null, p_subject text default null,
                                                      p_from date default null, p_to date default null, p_kind text default null)
returns table (section_code text, grade_code text, subject_id text, subject_name text, n_students bigint, n_attempts bigint,
               avg_pct numeric, median_pct numeric, min_pct smallint, max_pct smallint)
language sql stable security invoker set search_path = '' as $$
  select f.section_code, f.grade_code, f.subject_id, f.subject_name, count(distinct f.student_id), count(*),
         round(avg(f.score_pct), 1),
         round((percentile_cont(0.5) within group (order by f.score_pct))::numeric, 1),
         min(f.score_pct), max(f.score_pct)
    from public.dash_filtered(p_section, p_grade, p_subject, p_from, p_to, p_kind) f
   group by f.section_code, f.grade_code, f.subject_id, f.subject_name
   order by f.grade_code, f.subject_id
$$;

-- 3) pass / fail (threshold is an ASSUMPTION until the school sets it; default 50%)
--    per student: best score in the window ≥ threshold → pass. Per attempt counts too.
create or replace function public.dash_pass_summary(p_pass_pct integer default 50, p_section text default null, p_grade text default null,
                                                    p_subject text default null, p_from date default null, p_to date default null, p_kind text default null)
returns table (section_code text, grade_code text, subject_id text, subject_name text, pass_pct integer,
               n_students bigint, n_pass bigint, n_fail bigint, pass_rate numeric, n_attempts bigint, n_attempts_pass bigint)
language sql stable security invoker set search_path = '' as $$
  with f as (select * from public.dash_filtered(p_section, p_grade, p_subject, p_from, p_to, p_kind)),
       best as (select section_code, grade_code, subject_id, subject_name, student_id, max(score_pct) as best,
                       count(*) as n_att, count(*) filter (where score_pct >= coalesce(p_pass_pct, 50)) as n_att_pass
                  from f group by 1,2,3,4,5)
  select section_code, grade_code, subject_id, subject_name, coalesce(p_pass_pct, 50),
         count(*), count(*) filter (where best >= coalesce(p_pass_pct, 50)), count(*) filter (where best < coalesce(p_pass_pct, 50)),
         round(100.0 * count(*) filter (where best >= coalesce(p_pass_pct, 50)) / nullif(count(*), 0), 1),
         sum(n_att)::bigint, sum(n_att_pass)::bigint
    from best group by 1,2,3,4 order by 2,3
$$;

-- 4a) usage per day (Bangkok)
create or replace function public.dash_daily_activity(p_section text default null, p_grade text default null, p_subject text default null,
                                                      p_from date default null, p_to date default null, p_kind text default null)
returns table (day date, n_active_students bigint, n_attempts bigint, n_items bigint)
language sql stable security invoker set search_path = '' as $$
  select f.day_bkk, count(distinct f.student_id), count(*), coalesce(sum(f.n_items), 0)::bigint
    from public.dash_filtered(p_section, p_grade, p_subject, p_from, p_to, p_kind) f
   group by f.day_bkk order by f.day_bkk desc
$$;

-- 4b) usage per subject (attempts, students, last active)
create or replace function public.dash_subject_activity(p_section text default null, p_grade text default null, p_subject text default null,
                                                        p_from date default null, p_to date default null, p_kind text default null)
returns table (section_code text, grade_code text, subject_id text, subject_name text, n_attempts bigint, n_practice bigint,
               n_tests bigint, n_students bigint, last_active timestamptz)
language sql stable security invoker set search_path = '' as $$
  select f.section_code, f.grade_code, f.subject_id, f.subject_name, count(*), count(*) filter (where f.kind = 'practice'),
         count(*) filter (where f.kind <> 'practice'), count(distinct f.student_id), max(f.at)
    from public.dash_filtered(p_section, p_grade, p_subject, p_from, p_to, p_kind) f
   group by 1,2,3,4 order by 2,3
$$;

revoke execute on function public.dash_filtered(text,text,text,date,date,text) from public, anon;
revoke execute on function public.dash_students(text,text,text,date,date,text) from public, anon;
revoke execute on function public.dash_subject_scores(text,text,text,date,date,text) from public, anon;
revoke execute on function public.dash_pass_summary(integer,text,text,text,date,date,text) from public, anon;
revoke execute on function public.dash_daily_activity(text,text,text,date,date,text) from public, anon;
revoke execute on function public.dash_subject_activity(text,text,text,date,date,text) from public, anon;
grant execute on function public.dash_filtered(text,text,text,date,date,text) to authenticated;
grant execute on function public.dash_students(text,text,text,date,date,text) to authenticated;
grant execute on function public.dash_subject_scores(text,text,text,date,date,text) to authenticated;
grant execute on function public.dash_pass_summary(integer,text,text,text,date,date,text) to authenticated;
grant execute on function public.dash_daily_activity(text,text,text,date,date,text) to authenticated;
grant execute on function public.dash_subject_activity(text,text,text,date,date,text) to authenticated;
revoke all on public.v_dash_attempts from anon;
grant select on public.v_dash_attempts to authenticated;
