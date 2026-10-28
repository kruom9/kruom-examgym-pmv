#!/usr/bin/env python3
"""LOCAL ONLY: RLS + behaviour tests for migrations 0600 (sections, director, roster identity, legacy staging),
0700 (director dashboard RPCs) and 0800 (advisor fixes). Uses only fake data and removes it at the end.
Run after make_teacher.py (teacher.m1@examgym.local)."""
import os, sys, uuid
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib.util
spec = importlib.util.spec_from_file_location("h", os.path.join(os.path.dirname(os.path.abspath(__file__)), "_rest.py")); H = importlib.util.module_from_spec(spec); spec.loader.exec_module(H)
check, rest, rpc, http, denied, student, login, DB, K = H.check, H.rest, H.rpc, H.http, H.denied, H.student, H.login, H.DB, H.K

# ---- schema ----
no_rls = DB.execute("select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity").fetchall()
check("RLS on every public table (incl. sections/roster/legacy)", not no_rls, str(no_rls))
new = ["sections", "teacher_section_scopes", "roster_students", "roster_claim_failures", "legacy_import_batches", "legacy_people", "legacy_results", "legacy_answers"]
have = {r[0] for r in DB.execute("select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relkind='r'")}
check("new tables exist", set(new) <= have, str(set(new) - have))
multi = DB.execute("select tablename, cmd, count(*) from pg_policies where schemaname='public' and permissive='PERMISSIVE' and 'authenticated' = any(roles) group by 1,2 having count(*) > 1").fetchall()
check("one permissive policy per table/action (advisor fix)", not multi, str(multi))
secs = DB.execute("select code from public.grades order by sort").fetchall()
check("grades carry derived section", DB.execute("select bool_and(section_code = case when code like 'P%' then 'prathom' else 'mattayom' end) from grades").fetchone()[0])
try: DB.execute("insert into public.grades (code,name_th,sort) values ('X1','x',99)"); check("grade code check rejects X1", False)
except Exception: check("grade code check rejects X1", True)
for bad, why in (("1234567890123", "13-digit national ID"),):
    try: DB.execute("insert into public.roster_students (grade_code, student_code, full_name, source) values ('M1', %s, 'ทดสอบ ระบบ', 'school_roster')", (bad,)); check(f"roster rejects {why}", False)
    except Exception: check(f"roster rejects {why}", True)

# ---- anon ----
st, j, _ = rest("GET", "sections?select=code"); check("anon reads sections", st == 200 and {r["code"] for r in j} == {"mattayom", "prathom"}, str(j))
for t in new[1:] + ["v_dash_attempts"]:
    st, j, _ = rest("GET", t + "?select=*&limit=1"); check(f"anon cannot read {t}", denied(st) or j == [], f"HTTP {st}")
for fn in ("dash_students", "dash_subject_scores", "dash_pass_summary", "dash_daily_activity", "dash_subject_activity", "claim_roster", "grant_director"):
    st, j, _ = rpc(fn, {}); check(f"anon cannot call {fn}", denied(st), f"HTTP {st}")

# ---- fake people ----
A, a_id = student("นักเรียนทดสอบ ซี (สมมติ)", "M1", "ม.1/1")
B, b_id = student("นักเรียนทดสอบ ดี (สมมติ)", "M2", "ม.2/1")
item1 = DB.execute("select id, answer_index from items where grade_code='M1' and status in ('draft','reviewed','imported') limit 1").fetchone()
item2 = DB.execute("select id, answer_index from items where grade_code='M2' and status in ('draft','reviewed','imported') limit 1").fetchone()
sub1 = DB.execute("select subject_id from items where id=%s", (item1[0],)).fetchone()[0]
sub2 = DB.execute("select subject_id from items where id=%s", (item2[0],)).fetchone()[0]
st, j, _ = rpc("record_attempt", {"p": {"client_attempt_id": "rlstest-a-01", "grade_code": "M1", "kind": "practice", "subject_id": sub1, "answers": [{"item_id": item1[0], "position": 0, "choice_index": item1[1]}]}}, A)
check("student A records attempt", st == 200, str(j)[:120])
st, j, _ = rpc("record_attempt", {"p": {"client_attempt_id": "rlstest-b-01", "grade_code": "M2", "kind": "practice", "subject_id": sub2, "answers": [{"item_id": item2[0], "position": 0, "choice_index": (item2[1] + 1) % 4}]}}, B)
check("student B records attempt", st == 200, str(j)[:120])

# students get nothing from reports or staging
st, j, _ = rpc("dash_students", {}, A); check("student: dash_students returns no rows", st == 200 and j == [], f"{st} {str(j)[:80]}")
st, j, _ = rpc("dash_subject_scores", {}, A); check("student: dash_subject_scores returns no rows", st == 200 and j == [], f"{st}")
st, j, _ = rest("GET", "v_dash_attempts?select=student_id", A); check("student sees only own rows in v_dash_attempts", st == 200 and {r["student_id"] for r in j} <= {a_id}, f"{len(j) if isinstance(j, list) else j}")
for t in ("roster_students", "legacy_people", "legacy_results", "legacy_answers", "legacy_import_batches", "roster_claim_failures"):
    st, j, _ = rest("GET", t + "?select=*", A); check(f"student cannot read {t}", denied(st) or j == [], f"HTTP {st}")
st, j, _ = rest("POST", "roster_students", A, {"grade_code": "M1", "full_name": "ปลอม ทดสอบ", "source": "school_roster"}); check("student cannot insert roster", denied(st), f"HTTP {st}")
st, j, _ = rest("POST", "legacy_results", A, {"source": "m6_sheet", "source_row_key": "x", "person_key": "x"}); check("student cannot insert legacy_results", denied(st), f"HTTP {st}")
st, j, _ = rpc("grant_director", {"p_email": "x@y.z", "p_section": "mattayom"}, A); check("student cannot call grant_director", denied(st), f"HTTP {st}")
st, j, _ = rest("PATCH", f"profiles?id=eq.{a_id}", A, {"role": "director"}, Prefer="return=representation")
check("student cannot self-promote to director", DB.execute("select role from profiles where id=%s", (a_id,)).fetchone()[0] == "student", f"HTTP {st}")

# ---- roster claim (fake row) ----
rid = DB.execute("insert into public.roster_students (grade_code, room, student_no, student_code, full_name, source) values ('M1','ม.1/1',1,'T0001','เด็กหญิงทดสอบ ซี','school_roster') returning id").fetchone()[0]
DB.execute("insert into public.roster_students (grade_code, room, student_no, student_code, full_name, source) values ('M2','ม.2/1',1,'T0002','เด็กชายทดสอบ ดี','school_roster')")
st, j, _ = rpc("claim_roster", {"p_student_code": "T0001", "p_full_name": "ทดสอบ ผิดชื่อ"}, A); check("claim with wrong name fails", st == 200 and j[0]["ok"] is False, str(j)[:80])
st, j, _ = rpc("claim_roster", {"p_student_code": "T0001", "p_full_name": "ทดสอบ ซี"}, A); check("claim with code + name (title optional) works", st == 200 and j[0]["ok"] is True, str(j)[:100])
st, j, _ = rest("GET", "roster_students?select=id,claimed_by", A); check("student reads own claimed roster row only", st == 200 and [r["id"] for r in j] == [str(rid)], str(j)[:100])
st, j, _ = rpc("claim_roster", {"p_student_code": "T0001", "p_full_name": "ทดสอบ ซี"}, B); check("other grade cannot claim it", st == 200 and j[0]["ok"] is False, str(j)[:80])
for _ in range(5): rpc("claim_roster", {"p_student_code": "NOPE", "p_full_name": "x y"}, B)
st, j, _ = rpc("claim_roster", {"p_student_code": "T0002", "p_full_name": "ทดสอบ ดี"}, B); check("claim rate limit (5 fails / hour)", st == 200 and j[0]["ok"] is False and "too many" in j[0]["message"], str(j)[:100])

# ---- legacy staging rows (owner/service role writes; teacher reads own grade) ----
DB.execute("insert into public.legacy_people (source, source_key, grade_code, full_name, family_hash) values ('m6_sheet','T-M1','M1','ทดสอบ เลกาซี (สมมติ)','F0123456789'), ('m6_sheet','T-M2','M2','ทดสอบ เลกาซี2 (สมมติ)',null)")
try: DB.execute("insert into public.legacy_people (source, source_key, family_hash) values ('p6_sheet','bad','SALT-LEAK')"); check("family_hash format enforced", False)
except Exception: check("family_hash format enforced", True)
DB.execute("insert into public.legacy_results (source, source_row_key, person_key, grade_code, n_correct, n_total) values ('m6_sheet','E1','T-M1','M1',3,5) on conflict do nothing")
dup = DB.execute("insert into public.legacy_results (source, source_row_key, person_key, grade_code) values ('m6_sheet','E1','T-M1','M1') on conflict (source, source_row_key) do nothing returning id").fetchall()
check("legacy import idempotent on (source, row key)", dup == [])

# ---- teacher M1 (grade scope) ----
T = login("teacher.m1@examgym.local", "local-teacher-pass-1")
st, j, _ = rpc("dash_students", {}, T); g = {r["grade_code"] for r in j}
check("teacher M1: dash_students only ม.1", st == 200 and g <= {"M1"} and a_id in {r["student_id"] for r in j}, str(g))
st, j, _ = rpc("dash_subject_scores", {}, T); check("teacher M1: subject scores only ม.1", st == 200 and {r["grade_code"] for r in j} <= {"M1"} and len(j) >= 1, str(j)[:120])
st, j, _ = rest("GET", "roster_students?select=grade_code", T); check("teacher M1 reads ม.1 roster only", st == 200 and {r["grade_code"] for r in j} == {"M1"}, str(j)[:80])
st, j, _ = rest("GET", "legacy_people?select=grade_code", T); check("teacher M1 reads ม.1 legacy only", st == 200 and {r["grade_code"] for r in j} == {"M1"}, str(j)[:80])
st, j, _ = rest("GET", "legacy_import_batches?select=id", T); check("teacher cannot read import batches (admin only)", st == 200 and j == [] or denied(st), f"HTTP {st}")

# ---- director (section มัธยม) ----
em = f"director.{uuid.uuid4().hex[:6]}@examgym.local"
http("POST", "/auth/v1/admin/users", body={"email": em, "password": "local-director-pass-9", "email_confirm": True}, headers={"apikey": K["SERVICE_ROLE_KEY"], "Authorization": "Bearer " + K["SERVICE_ROLE_KEY"]})
DB.execute("select public.grant_director(%s, 'mattayom', 'ผู้บริหารทดสอบ (สมมติ)')", (em,))
Dt = login(em, "local-director-pass-9")
st, j, _ = rpc("dash_students", {}, Dt); ids = {r["student_id"] for r in j}
check("director มัธยม sees ม.1 and ม.2 students", st == 200 and {a_id, b_id} <= ids, f"{len(j)} rows")
st, j, _ = rpc("dash_students", {"p_grade": "M2"}, Dt); check("grade filter works", st == 200 and {r["grade_code"] for r in j} == {"M2"}, f"{len(j)}")
st, j, _ = rpc("dash_pass_summary", {"p_pass_pct": 50}, Dt); n50 = sum(r["n_pass"] for r in j)
st, j, _ = rpc("dash_pass_summary", {"p_pass_pct": 101}, Dt); n101 = sum(r["n_pass"] for r in j)
check("pass threshold is a parameter (50 vs 101)", n50 >= 1 and n101 == 0, f"{n50} vs {n101}")
st, j, _ = rpc("dash_daily_activity", {"p_from": "2000-01-01", "p_to": "2000-01-02"}, Dt); check("date filter excludes out-of-range days", st == 200 and j == [], str(j)[:80])
st, j, _ = rpc("dash_subject_activity", {}, Dt); check("usage per subject has last_active", st == 200 and all(r["last_active"] for r in j) and len(j) >= 2, f"{len(j)}")
st, j, _ = rpc("dash_subject_scores", {"p_section": "prathom"}, Dt); check("director มัธยม gets nothing for ประถม", st == 200 and j == [], str(j)[:80])
st, j, _ = rest("GET", "teacher_section_scopes?select=section_code", Dt); check("director reads own section scope", st == 200 and [r["section_code"] for r in j] == ["mattayom"], str(j))

# ---- cleanup (delete_my_data for students, SQL for fake staff/roster/legacy) ----
for tok in (A, B): rpc("delete_my_data", {}, tok)
DB.execute("delete from public.roster_students where student_code in ('T0001','T0002')")
DB.execute("delete from public.legacy_results where source_row_key='E1'"); DB.execute("delete from public.legacy_people where source_key in ('T-M1','T-M2')")
DB.execute("delete from auth.users where email=%s", (em,))
left = DB.execute("select count(*) from profiles where id in (%s,%s)", (a_id, b_id)).fetchone()[0]
check("cleanup removed fake students", left == 0)
print(f"\n{H.ok()}/{H.ok() + H.fail()} passed"); sys.exit(1 if H.fail() else 0)
