#!/usr/bin/env python3
"""LOCAL STACK ONLY — clearly-labelled FAKE demo data for the director dashboard.
Creates anonymous students named 'นักเรียนตัวอย่าง NN (สมมติ)' (school 'โรงเรียนตัวอย่าง (สมมติ)') through the same RPCs the app uses,
with attempts spread over the last 14 days (Asia/Bangkok), plus a fake director 'director.demo@examgym.local'.
Refuses to run against anything except 127.0.0.1."""
import json, os, random, datetime as dt, urllib.request, psycopg
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
K = dict(l.strip().split("=", 1) for l in open(os.path.join(ROOT, ".local/keys.env")) if "=" in l)
API, ANON = K["SUPABASE_URL"], K["ANON_KEY"]
assert API.startswith("http://127.0.0.1") and "127.0.0.1" in K["DB_URL"], "demo data is for the LOCAL stack only"
DIRECTOR = ("director.demo@examgym.local", "local-director-pass-1")
def http(m, path, tok=None, body=None, key=None):
    h = {"apikey": key or ANON, "Authorization": "Bearer " + (tok or key or ANON), "Content-Type": "application/json"}
    r = urllib.request.Request(API + path, method=m, headers=h, data=None if body is None else json.dumps(body).encode())
    with urllib.request.urlopen(r) as x: t = x.read().decode(); return json.loads(t) if t else None
rpc = lambda fn, a, tok: http("POST", "/rest/v1/rpc/" + fn, tok, a)
def main(n_per_grade=6, seed=7):
    rnd = random.Random(seed); db = psycopg.connect(K["DB_URL"], autocommit=True)
    items = {}
    for g, sid, strand, iid in db.execute("select grade_code, subject_id, strand_id, id from items where status in ('draft','reviewed','imported') and grade_code in ('M1','M2','M3','M4','M5')"):
        items.setdefault(g, {}).setdefault(sid, []).append((strand, iid))
    now = dt.datetime.now(dt.timezone.utc); k = 0
    for g in ("M1", "M2", "M3", "M4", "M5"):
        gn = "ม." + g[1]
        for i in range(n_per_grade):
            k += 1
            tok = http("POST", "/auth/v1/signup", body={})["access_token"]
            rpc("register_student", {"p_full_name": f"นักเรียนตัวอย่าง {k:02d} (สมมติ)", "p_school": "โรงเรียนตัวอย่าง (สมมติ)", "p_line_id": f"demo_{k:02d}", "p_consent": True, "p_src": "demo-local"}, tok)
            rpc("set_my_grade", {"p_grade_code": g, "p_room": f"{gn}/{1 + i % 3}"}, tok)
            skill = rnd.uniform(0.25, 0.9)
            for a in range(rnd.randint(2, 9)):
                sid = rnd.choice(sorted(items[g])); pool = items[g][sid]; picks = rnd.sample(pool, min(5, len(pool)))
                keys = {iid: ai for iid, ai in db.execute("select id, answer_index from items where id = any(%s)", ([p[1] for p in picks],))}
                when = now - dt.timedelta(days=rnd.randint(0, 13), hours=rnd.randint(0, 10), minutes=rnd.randint(0, 59))
                ans = [{"item_id": iid, "position": pos, "choice_index": keys[iid] if rnd.random() < skill else (keys[iid] + 1) % 4, "time_ms": rnd.randint(8000, 60000)} for pos, (_, iid) in enumerate(picks)]
                rpc("record_attempt", {"p": {"client_attempt_id": f"demo-{k}-{a}", "grade_code": g, "kind": "practice", "subject_id": sid, "strand_id": picks[0][0],
                     "started_at": (when - dt.timedelta(minutes=4)).isoformat(), "submitted_at": when.isoformat(), "meta": {"app": "demo-local", "fake": True}, "answers": ans}}, tok)
    # fake director (section มัธยม)
    try: http("POST", "/auth/v1/admin/users", body={"email": DIRECTOR[0], "password": DIRECTOR[1], "email_confirm": True}, key=K["SERVICE_ROLE_KEY"])
    except Exception: pass
    db.execute("select public.grant_director(%s, 'mattayom', 'ผู้บริหารตัวอย่าง (สมมติ)')", (DIRECTOR[0],))
    print(f"demo ready: {k} fake students · director {DIRECTOR[0]}")
if __name__ == "__main__": main()
