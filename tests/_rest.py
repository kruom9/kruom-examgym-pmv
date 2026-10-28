"""Shared LOCAL-stack REST helpers for tests (same calls as tests/rls_test.py)."""
import json, os, urllib.request, urllib.error, psycopg
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
K = dict(l.strip().split("=", 1) for l in open(os.path.join(ROOT, ".local/keys.env")) if "=" in l)
API, ANON = "http://127.0.0.1:54321", K["ANON_KEY"]
DB = psycopg.connect(K["DB_URL"], autocommit=True)
_c = [0, 0]
def ok(): return _c[0]
def fail(): return _c[1]
def check(name, cond, info=""):
    _c[0 if cond else 1] += 1
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
def student(name, grade, room):
    st, j, _ = http("POST", "/auth/v1/signup", body={}); assert st == 200, j; tok, uid = j["access_token"], j["user"]["id"]
    st, j, _ = rpc("register_student", {"p_full_name": name, "p_school": "โรงเรียนปิยมิตรวิทยา", "p_line_id": "test_" + uid[:6], "p_consent": True}, tok); assert st == 200, j
    st, j, _ = rpc("set_my_grade", {"p_grade_code": grade, "p_room": room}, tok); assert st == 200, j
    return tok, uid
def login(email, pw):
    st, j, _ = http("POST", "/auth/v1/token?grant_type=password", body={"email": email, "password": pw}); assert st == 200, j; return j["access_token"]
