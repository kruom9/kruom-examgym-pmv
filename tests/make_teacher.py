#!/usr/bin/env python3
"""LOCAL ONLY: create a test teacher (fake address on .local) through GoTrue's admin API, then grant_teacher() for ม.1.
In the real project the owner creates the teacher in the Supabase dashboard and runs grant_teacher() in the SQL editor."""
import json, os, sys, urllib.request, urllib.error, psycopg
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
K = dict(l.strip().split("=", 1) for l in open(os.path.join(ROOT, ".local/keys.env")) if "=" in l)
EMAIL, PW, GRADE = (sys.argv[1:4] + ["teacher.m1@examgym.local", "local-teacher-pass-1", "M1"][len(sys.argv[1:4]):])
req = urllib.request.Request("http://127.0.0.1:54321/auth/v1/admin/users", method="POST", data=json.dumps({"email": EMAIL, "password": PW, "email_confirm": True}).encode(),
                             headers={"apikey": K["SERVICE_ROLE_KEY"], "Authorization": "Bearer " + K["SERVICE_ROLE_KEY"], "Content-Type": "application/json"})
try: urllib.request.urlopen(req)
except urllib.error.HTTPError as e:
    if e.code not in (422, 400): raise
with psycopg.connect(K["DB_URL"], autocommit=True) as c:
    c.execute("select public.grant_teacher(%s, %s, %s)", (EMAIL, GRADE, "ครูทดสอบ (ข้อมูลสมมติ)"))
print("teacher ready:", EMAIL, GRADE)
