#!/usr/bin/env python3
"""Milestone 4: RLS / security tests against the LOCAL stack only (gateway http://127.0.0.1:54321 → GoTrue + PostgREST).
Every request goes through the same REST path the app uses, with the anon key or a signed-in student/teacher token.
Run on a fresh stack: bash dev/local-stack/start.sh && python3 tests/make_teacher.py && python3 tests/rls_test.py"""
import json, os, sys, uuid, urllib.request, urllib.error, psycopg
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
K = dict(l.strip().split("=", 1) for l in open(os.path.join(ROOT, ".local/keys.env")) if "=" in l)
API, ANON = "http://127.0.0.1:54321", K["ANON_KEY"]
DB = psycopg.connect(K["DB_URL"], autocommit=True)
ok = fail = 0
def check(name, cond, info=""):
    global ok, fail
    ok += bool(cond); fail += not cond
    print(("PASS " if cond else "FAIL ") + name + (f" · {info}" if info else ""))
def http(method, path, tok=None, body=None, headers=None):
    h = {"apikey": ANON, "Authorization": "Bearer " + (tok or ANON), "Content-Type": "application/json"}; h.update(headers or {})
    r = urllib.request.Request(API + path, method=method, headers=h, data=None if body is None else json.dumps(body).encode())
    try:
        with urllib.request.urlopen(r) as x: t = x.read().decode(); return x.status, (json.loads(t) if t else None), dict(x.headers)
    except urllib.error.HTTPError as e:
        t = e.read().decode()
        try: return e.code, json.loads(t), dict(e.headers)
        except Exception: return e.code, t, dict(e.headers)
def rest(m, p, tok=None, body=None, **h): return http(m, "/rest/v1/" + p, tok, body, h or None)
def rpc(fn, args, tok=None): return rest("POST", "rpc/" + fn, tok, args)
def denied(st): return st in (401, 403) or st >= 400
def anon_user():
    st, j, _ = http("POST", "/auth/v1/signup", body={}); assert st == 200, (st, j); return j["access_token"], j["user"]["id"]
def student(name, grade, room):
    tok, uid = anon_user()
    st, j, _ = rpc("register_student", {"p_full_name": name, "p_school": "โรงเรียนปิยมิตรวิทยา", "p_line_id": "test_" + uid[:6], "p_consent": True}, tok); assert st == 200, j
    st, j, _ = rpc("set_my_grade", {"p_grade_code": grade, "p_room": room}, tok); assert st == 200, j
    return tok, uid
def login(email, pw):
    st, j, _ = http("POST", "/auth/v1/token?grant_type=password", body={"email": email, "password": pw}); assert st == 200, j; return j["access_token"]
def count(p, tok):
    st, j, h = rest("GET", p, tok, Prefer="count=exact", Range="0-0"); return st, int(({k.lower(): v for k, v in h.items()}.get("content-range") or "*/0").split("/")[-1] or 0)

# ---- schema-level ----
no_rls = DB.execute("select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity").fetchall()
check("RLS enabled on every public table", not no_rls, f"tables without RLS: {no_rls}")
views = DB.execute("select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='v' and not coalesce(c.reloptions::text like '%security_invoker=true%', false)").fetchall()
check("every view is security_invoker (caller's RLS applies)", not views, str(views))

# ---- anon (key only, not signed in) ----
for t in ("items", "profiles", "attempts", "answers", "teacher_scopes", "v_student_progress"):
    st, j, _ = rest("GET", t + "?select=*&limit=1")
    check(f"anon cannot read {t}", denied(st) or j == [], f"HTTP {st}")
st, j, _ = rest("POST", "attempts", body={"grade_code": "M1", "kind": "practice", "client_attempt_id": "x"}); check("anon cannot insert attempts", denied(st), f"HTTP {st}")
st, j, _ = rpc("record_attempt", {"p": {"grade_code": "M1", "kind": "practice", "answers": [{"item_id": "x", "position": 1}]}}); check("anon cannot call record_attempt", denied(st), f"HTTP {st}")
st, j, _ = rest("PATCH", "items?id=not.is.null", body={"answer_index": 0}); check("anon cannot update items", denied(st), f"HTTP {st}")
st, j, _ = rpc("bank_counts", {}); check("anon can call bank_counts (public counts only)", st == 200 and isinstance(j, list) and len(j) > 0, f"HTTP {st}, {len(j) if isinstance(j, list) else j} rows")
st, j, _ = rest("GET", "grades?select=code,status"); check("anon can read grades (picker)", st == 200 and len([g for g in j if g["code"].startswith("M")]) == 6, f"{len(j) if isinstance(j, list) else j}")

# ---- two students, two grades ----
A, a_id = student("นักเรียนทดสอบ เอ (สมมติ)", "M1", "ม.1/1")
B, b_id = student("นักเรียนทดสอบ บี (สมมติ)", "M2", "ม.2/3")
st, j, _ = rest("GET", "profiles?select=id", A); check("student reads only own profile", st == 200 and [r["id"] for r in j] == [a_id], f"{len(j)} rows")
st, j, _ = rest("PATCH", f"profiles?id=eq.{b_id}", A, {"grade_code": "M3", "room": "ม.3/1"}, Prefer="return=representation")
gb = DB.execute("select grade_code, room from profiles where id=%s", (b_id,)).fetchone()
check("student A cannot change student B's grade", gb == ("M2", "ม.2/3") and (denied(st) or j == []), f"B still {gb}")
for col, val in (("role", "teacher"), ("full_name", "แก้ชื่อ"), ("legacy_student_id", "x"), ("consent", False)):
    st, j, _ = rest("PATCH", f"profiles?id=eq.{a_id}", A, {col: val})
    check(f"student cannot update own {col}", denied(st), f"HTTP {st}")
check("role still student", DB.execute("select role from profiles where id=%s", (a_id,)).fetchone()[0] == "student")
for g, room, why in (("M6", "ม.6/1", "external grade ม.6"), ("M9", "ม.9/1", "unknown grade"), ("M1", "ม.1/99", "room out of range"), ("M1", "ม.2/1", "room of another grade"), ("M1", "ม.1/1'; drop table items;--", "injection-ish room")):
    st, j, _ = rpc("set_my_grade", {"p_grade_code": g, "p_room": room}, A); check(f"set_my_grade rejects {why}", denied(st), f"HTTP {st}")
st, j, _ = rpc("set_my_grade", {"p_grade_code": "M3", "p_room": "ม.3/4"}, A); check("student can change own grade to a live grade", st == 200 and j["grade_code"] == "M3", f"HTTP {st}")
st, j, _ = rpc("set_my_grade", {"p_grade_code": "M1", "p_room": "ม.1/1"}, A); check("…and back to ม.1", st == 200 and j["grade_code"] == "M1")
st, j, _ = rest("POST", "teacher_scopes", A, {"teacher_id": a_id, "grade_code": "M1"}); check("student cannot insert teacher_scopes", denied(st), f"HTTP {st}")
st, j, _ = rpc("grant_teacher", {"p_email": "x@x", "p_grade_code": "M1"}, A); check("student cannot call grant_teacher", denied(st), f"HTTP {st}")
st, j, _ = rpc("teaches_grade", {"g": "M1"}, A); check("student teaches_grade(M1) is false", j is False or denied(st), str(j))

# ---- items ----
st, n1 = count("items?grade_code=eq.M1&select=id", A); check("student reads ม.1 draft items", n1 == 218, str(n1))
st, n6 = count("items?grade_code=eq.M6&select=id", A); check("ม.6 imported items not served to students here (ม.6 = external app)", n6 == 0, str(n6))
st, j, _ = rest("PATCH", "items?id=eq.M1-MA-1-1", A, {"answer_index": 3}); check("student cannot update items", denied(st), f"HTTP {st}")
st, j, _ = rest("POST", "items", A, {"id": "evil", "grade_code": "M1"}); check("student cannot insert items", denied(st), f"HTTP {st}")

# ---- server-side scoring cannot be forged ----
items = DB.execute("select id, answer_keys from items where grade_code='M1' order by id limit 10").fetchall()
ans = [{"item_id": i, "position": n + 1, "choice_index": (k[0] if n < 3 else (k[0] + 1) % 4), "time_ms": 1000, "is_correct": True} for n, (i, k) in enumerate(items)]
p = {"client_attempt_id": "forge-" + uuid.uuid4().hex[:8], "grade_code": "M1", "kind": "practice", "student_id": b_id, "n_correct": 10, "score_pct": 100, "passed": True, "answers": ans}
st, j, _ = rpc("record_attempt", {"p": p}, A)
check("record_attempt scores on the server (3/10 real, 10/10 claimed)", st == 200 and j["n_items"] == 10 and j["n_correct"] == 3 and j["score_pct"] == 30 and j["passed"] is False, f"{j.get('n_correct') if isinstance(j, dict) else j}/{j.get('n_items') if isinstance(j, dict) else ''}")
check("attempt belongs to the caller (student_id forge ignored)", isinstance(j, dict) and j["student_id"] == a_id)
att_a = j["id"]
st, j2, _ = rpc("record_attempt", {"p": p}, A); check("record_attempt is idempotent per client_attempt_id", st == 200 and j2["id"] == att_a)
st, j, _ = rest("POST", "attempts", A, {"grade_code": "M1", "kind": "practice", "client_attempt_id": "raw-" + uuid.uuid4().hex[:6], "n_correct": 50, "score_pct": 100, "passed": True}, Prefer="return=representation")
check("direct attempt insert gets score zeroed by trigger", st == 201 and j[0]["score_pct"] == 0 and j[0]["passed"] is False, f"HTTP {st}")
st, j, _ = rest("PATCH", f"attempts?id=eq.{att_a}", A, {"score_pct": 100, "passed": True}); check("student cannot update attempts", denied(st), f"HTTP {st}")
st, j, _ = rest("DELETE", f"attempts?id=eq.{att_a}", A); check("student cannot delete attempts", denied(st), f"HTTP {st}")
st, j, _ = rest("PATCH", f"answers?attempt_id=eq.{att_a}", A, {"is_correct": True}); check("student cannot update answers", denied(st), f"HTTP {st}")
st, j, _ = rpc("record_attempt", {"p": dict(p, client_attempt_id="m2-" + uuid.uuid4().hex[:6], grade_code="M2")}, A); check("cannot record an attempt for another grade", denied(st), f"HTTP {st}")
m2 = DB.execute("select id from items where grade_code='M2' limit 1").fetchone()[0]
st, j, _ = rpc("record_attempt", {"p": dict(p, client_attempt_id="mix-" + uuid.uuid4().hex[:6], answers=[{"item_id": m2, "position": 1, "choice_index": 0}])}, A); check("cannot answer items from another grade", denied(st), f"HTTP {st}")
b_items = DB.execute("select id from items where grade_code='M2' order by id limit 3").fetchall()
st, jb, _ = rpc("record_attempt", {"p": {"client_attempt_id": "b-" + uuid.uuid4().hex[:6], "grade_code": "M2", "kind": "practice", "answers": [{"item_id": i, "position": n + 1, "choice_index": 0} for n, (i,) in enumerate(b_items)]}}, B)
assert st == 200, jb
st, j, _ = rest("POST", "answers", A, {"attempt_id": jb["id"], "item_id": b_items[0][0], "position": 9, "choice_index": 0}); check("student A cannot add answers to B's attempt", denied(st), f"HTTP {st}")
st, j, _ = rest("GET", "attempts?select=id,student_id", A); check("student reads only own attempts", st == 200 and all(r["student_id"] == a_id for r in j) and len(j) >= 2, f"{len(j)} rows")
st, j, _ = rest("GET", "answers?select=student_id", A); check("student reads only own answers", st == 200 and all(r["student_id"] == a_id for r in j), f"{len(j)} rows")
st, j, _ = rest("GET", f"answers?attempt_id=eq.{jb['id']}&select=id", A); check("student A sees none of B's answers", st == 200 and j == [])
st, j, _ = rest("GET", "v_student_progress?select=student_id", A); check("dashboard view gives a student only their own row", st == 200 and [r["student_id"] for r in j] == [a_id], f"{len(j)} rows")

# ---- teacher of ม.1 ----
T = login("teacher.m1@examgym.local", "local-teacher-pass-1")
st, j, _ = rest("GET", "profiles?select=id,grade_code&role=eq.student", T); ids = {r["id"] for r in j}
check("teacher ม.1 sees ม.1 student A", a_id in ids)
check("teacher ม.1 does not see ม.2 student B", b_id not in ids and all(r["grade_code"] == "M1" for r in j), f"{len(j)} students")
st, j, _ = rest("GET", "attempts?select=grade_code", T); check("teacher reads only ม.1 attempts", st == 200 and j and all(r["grade_code"] == "M1" for r in j), f"{len(j)} rows")
st, j, _ = rest("GET", f"answers?attempt_id=eq.{jb['id']}&select=id", T); check("teacher ม.1 cannot read ม.2 answers", st == 200 and j == [])
st, j, _ = rest("GET", "v_student_progress?select=grade_code", T); check("teacher dashboard view limited to ม.1", st == 200 and j and all(r["grade_code"] == "M1" for r in j), f"{len(j)} rows")
st, n6t = count("items?grade_code=eq.M6&select=id", T); check("teacher ม.1 cannot read ม.6 bank", n6t == 0, str(n6t))
st, j, _ = rest("PATCH", f"profiles?id=eq.{a_id}", T, {"grade_code": "M2", "room": "ม.2/1"}, Prefer="return=representation")
check("teacher cannot change a student's grade", DB.execute("select grade_code from profiles where id=%s", (a_id,)).fetchone()[0] == "M1", f"HTTP {st}")
st, j, _ = rest("PATCH", f"profiles?id=eq.{a_id}", T, {"role": "teacher"}); check("teacher cannot escalate a student's role", denied(st) or DB.execute("select role from profiles where id=%s", (a_id,)).fetchone()[0] == "student", f"HTTP {st}")
st, j, _ = rpc("grant_teacher", {"p_email": "x@x", "p_grade_code": "M2"}, T); check("teacher cannot call grant_teacher (owner only)", denied(st), f"HTTP {st}")

# ---- PDPA delete ----
st, j, _ = rpc("delete_my_data", {}, B)
left = DB.execute("select (select count(*) from profiles where id=%s),(select count(*) from attempts where student_id=%s),(select count(*) from answers where student_id=%s)", (b_id, b_id, b_id)).fetchone()
check("delete_my_data removes profile, attempts and answers", st in (200, 204) and left == (0, 0, 0), str(left))
print(f"\n{ok}/{ok + fail} passed"); sys.exit(1 if fail else 0)
