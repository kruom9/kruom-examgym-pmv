-- Exam Gym ปิยมิตรมัธยม · counts for the picker / subject pages + ม.6 shuffle metadata

-- ม.6 items keep the ม.6 app's own decision whether choices may be shuffled (fixedWhy() reason)
alter table public.items add column if not exists shuffle_reason text;

-- Public, counts-only summary (no item content): what each grade/subject/strand has.
-- security definer so the picker can show "ยังต้องเติม" / counts before login and for grades whose items are not served.
create or replace function public.bank_counts()
returns table (grade_code text, subject_id text, strand_id text, origin text, status text, n bigint)
language sql stable security definer set search_path = public as $$
  select i.grade_code, i.subject_id, i.strand_id, i.origin, i.status, count(*)
  from public.items i where i.status <> 'retired'
  group by 1,2,3,4,5
$$;
revoke all on function public.bank_counts() from public;
grant execute on function public.bank_counts() to anon, authenticated;
alter table public.exam_sets add column if not exists item_ids text[];  -- fixed paper (ม.6 'ชุดข้อสอบจริง ปี 2569' etc.); null = drawn by mix
