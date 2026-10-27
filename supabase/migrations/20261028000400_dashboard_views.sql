-- =====================================================================
-- ExamGym · teacher dashboard views
-- All views are security_invoker, so the caller's RLS applies:
-- a teacher sees their grade(s); a student sees only their own rows; anon sees nothing.
-- =====================================================================

-- per student
create view public.v_student_progress with (security_invoker = true) as
select p.id                      as student_id,
       p.grade_code, p.full_name, p.nick, p.school, p.room,
       p.created_at              as registered_at,
       count(distinct a.id) filter (where a.kind = 'practice')      as practice_rounds,
       coalesce(sum(a.n_items)   filter (where a.kind = 'practice'),0) as practice_items,
       coalesce(sum(a.n_correct) filter (where a.kind = 'practice'),0) as practice_correct,
       case when coalesce(sum(a.n_items) filter (where a.kind = 'practice'),0) > 0
            then round(100.0 * sum(a.n_correct) filter (where a.kind = 'practice')
                             / sum(a.n_items) filter (where a.kind = 'practice')) end as practice_pct,
       count(distinct a.id) filter (where a.kind = 'subject_room')  as subject_room_attempts,
       max(a.score_pct)     filter (where a.kind = 'subject_room')  as best_subject_room_pct,
       count(distinct a.id) filter (where a.kind = 'mock')          as mock_attempts,
       max(a.score_pct)     filter (where a.kind = 'mock')          as best_mock_pct,
       bool_or(a.passed)    filter (where a.kind = 'mock')          as mock_passed,
       max(a.submitted_at)                                          as last_active
  from public.profiles p
  left join public.attempts a on a.student_id = p.id
 where p.role = 'student'
 group by p.id;

-- per room (grade + school + room)
create view public.v_room_summary with (security_invoker = true) as
select s.grade_code, s.school, s.room,
       count(*)                                                     as n_students,
       count(*) filter (where s.last_active > now() - interval '7 days') as n_active_7d,
       sum(s.practice_items)                                        as practice_items,
       case when sum(s.practice_items) > 0 then round(100.0 * sum(s.practice_correct) / sum(s.practice_items)) end as practice_pct,
       round(avg(s.best_mock_pct))                                  as avg_best_mock_pct,
       count(*) filter (where s.mock_passed)                        as n_mock_passed
  from public.v_student_progress s
 group by s.grade_code, s.school, s.room;

-- per strand per room (all answers: practice + subject room + mock)
create view public.v_strand_summary with (security_invoker = true) as
select at.grade_code, p.school, p.room, i.subject_id, sj.name_th as subject_name,
       i.strand_id, st.code as strand_code, st.name_th as strand_name,
       count(distinct x.student_id)                                 as n_students,
       count(*)                                                     as n_answers,
       count(*) filter (where x.is_correct)                         as n_correct,
       round(100.0 * count(*) filter (where x.is_correct) / count(*)) as pct_correct,
       round(avg(x.time_ms) / 1000.0, 1)                            as avg_time_s
  from public.answers x
  join public.attempts at on at.id = x.attempt_id
  join public.profiles p  on p.id = x.student_id
  join public.items i     on i.id = x.item_id
  join public.strands st  on st.id = i.strand_id
  join public.subjects sj on sj.id = i.subject_id
 group by at.grade_code, p.school, p.room, i.subject_id, sj.name_th, i.strand_id, st.code, st.name_th;

-- per student per strand (drill-down)
create view public.v_student_strand with (security_invoker = true) as
select x.student_id, p.full_name, p.nick, p.room, p.grade_code, i.subject_id, i.strand_id, st.name_th as strand_name,
       count(*)                                                     as n_answers,
       count(*) filter (where x.is_correct)                         as n_correct,
       round(100.0 * count(*) filter (where x.is_correct) / count(*)) as pct_correct,
       max(x.created_at)                                            as last_answer_at
  from public.answers x
  join public.profiles p on p.id = x.student_id
  join public.items i    on i.id = x.item_id
  join public.strands st on st.id = i.strand_id
 group by x.student_id, p.full_name, p.nick, p.room, p.grade_code, i.subject_id, i.strand_id, st.name_th;

-- per item (helps the teacher review draft items: too easy / too hard / a distractor nobody picks)
create view public.v_item_stats with (security_invoker = true) as
select i.id as item_id, i.grade_code, i.subject_id, i.strand_id, i.difficulty, i.status, i.review_flag,
       count(x.id)                                                  as n_answers,
       case when count(x.id) > 0 then round(100.0 * count(*) filter (where x.is_correct) / count(x.id)) end as pct_correct,
       count(*) filter (where x.choice_index = 0) as n_choice_0,
       count(*) filter (where x.choice_index = 1) as n_choice_1,
       count(*) filter (where x.choice_index = 2) as n_choice_2,
       count(*) filter (where x.choice_index = 3) as n_choice_3,
       count(*) filter (where x.choice_index = 4) as n_choice_4,
       count(*) filter (where x.id is not null and x.choice_index is null) as n_skipped
  from public.items i
  left join public.answers x on x.item_id = i.id
 group by i.id;

grant select on public.v_student_progress, public.v_room_summary, public.v_strand_summary,
                public.v_student_strand, public.v_item_stats to authenticated;
