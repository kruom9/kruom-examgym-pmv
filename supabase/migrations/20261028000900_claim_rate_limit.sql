-- Fix: claim_roster's failure counter was rolled back by the exception it raised, so the 5-per-hour limit never
-- triggered. It now records the failure and RETURNS ok=false (no exception) so the row is kept.
-- Additive: replaces the function only (no table changes, no data).
drop function if exists public.claim_roster(text, text);
create function public.claim_roster(p_student_code text, p_full_name text)
returns table (ok boolean, room text, student_no smallint, message text)
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_prof public.profiles; v_r public.roster_students; v_key text;
begin
  if v_uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select * into v_prof from public.profiles where id = v_uid;
  if not found or v_prof.role <> 'student' or v_prof.grade_code is null then
    raise exception 'register and pick your grade first' using errcode = '42501'; end if;
  if (select count(*) from public.roster_claim_failures f where f.user_id = v_uid and f.at > now() - interval '1 hour') >= 5 then
    return query select false, null::text, null::smallint, 'too many tries, wait 1 hour'::text; return; end if;
  v_key := lower(regexp_replace(regexp_replace(coalesce(p_full_name,''),
             '^\s*(เด็กชาย|เด็กหญิง|ด\.\s*ช\.?|ด\.\s*ญ\.?|นางสาว|น\.\s*ส\.|นาย|นาง)\s*', ''), '\s+', '', 'g'));
  select * into v_r from public.roster_students r
   where r.grade_code = v_prof.grade_code and r.student_code = btrim(coalesce(p_student_code,''))
     and r.name_key = v_key and r.status = 'active' and (r.claimed_by is null or r.claimed_by = v_uid);
  if not found then
    insert into public.roster_claim_failures (user_id) values (v_uid);
    return query select false, null::text, null::smallint, 'no matching roster entry'::text; return;
  end if;
  update public.roster_students set claimed_by = v_uid, claimed_at = now() where id = v_r.id;
  return query select true, v_r.room, v_r.student_no, 'ok'::text;
end $$;
comment on function public.claim_roster(text,text) is
  'Student links own profile to a roster row (student_code + name, same grade, unclaimed). Returns ok=false on mismatch; 5 failures/hour/user. SECURITY DEFINER by design (advisor 0029 accepted).';
revoke execute on function public.claim_roster(text,text) from public, anon;
grant  execute on function public.claim_roster(text,text) to authenticated;
