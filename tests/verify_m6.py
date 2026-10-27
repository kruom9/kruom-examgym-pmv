#!/usr/bin/env python3
"""Milestone 3 check: ม.6 bank import is AS-IS.
Re-reads the read-only ม.6 source (5620e4c, examgym/m6-ios/data/*_bank.js), checks sha256 against the manifest and the
copies in content/m6/banks, then compares every item in the local DB with the source item field by field
(stem, choices, key, k→explanation, e→choice_notes, year). Also checks: no new/rewritten M6 items, no secrets in the copied files, shuffle flags kept."""
import json, os, hashlib, subprocess, sys, psycopg, re
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.environ.get("M6_SRC", "/workspace/kruom/kruom-cefr-shuffle/examgym/m6-ios")
DB = "postgresql://postgres@127.0.0.1:54322/postgres"
ok = fail = 0
def check(name, cond, info=""):
    global ok, fail
    ok += bool(cond); fail += not cond
    print(("PASS " if cond else "FAIL ") + name + (f" · {info}" if info else ""))
man = json.load(open(os.path.join(ROOT, "content/m6/m6_manifest.json"), encoding="utf-8"))
repo = os.path.dirname(os.path.dirname(SRC))
head = subprocess.check_output(["git", "-C", repo, "rev-parse", "HEAD"], text=True).strip()
check("source worktree at 5620e4c", head.startswith("5620e4c"), head[:12])
check("source unchanged (read-only)", subprocess.check_output(["git", "-C", repo, "status", "--porcelain", "--", "examgym/m6-ios"], text=True).strip() == "")
sha_ok = True
for b in man["banks"]:
    s1 = hashlib.sha256(open(os.path.join(SRC, "data", b["file"]), "rb").read()).hexdigest()
    s2 = hashlib.sha256(open(os.path.join(ROOT, "content/m6/banks", b["file"]), "rb").read()).hexdigest()
    if not (s1 == s2 == b["sha256"]): sha_ok = False; print("  sha mismatch", b["file"])
check("10 banks byte-identical (source = copy = manifest sha256)", sha_ok and len(man["banks"]) == 10, f"{len(man['banks'])} banks")
js = r"""const fs=require('fs'),vm=require('vm');const out={};for(const f of process.argv.slice(1)){const c={window:{}};vm.createContext(c);vm.runInContext(fs.readFileSync(f,'utf8'),c);const B=c.window[Object.keys(c.window)[0]];out[f.split('/').pop()]=B.items;}process.stdout.write(JSON.stringify(out));"""
src = json.loads(subprocess.check_output(["node", "-e", js] + [os.path.join(SRC, "data", b["file"]) for b in man["banks"]], text=True))
srcitems = {}
for b in man["banks"]:
    for it in src[b["file"]]: srcitems[f"M6-{b['subject']}-{it['id']}"] = it
check("source has 827 items", len(srcitems) == 827, str(len(srcitems)))
c = psycopg.connect(DB)
rows = c.execute("select id, stem, choices, answer_keys, choice_notes, explanation, exam_year, origin, status, no_shuffle, media from items where grade_code='M6'").fetchall()
check("DB has 827 ม.6 items, all origin imported_m6", len(rows) == 827 and all(r[7] == "imported_m6" and r[8] == "imported" for r in rows), str(len(rows)))
check("same ids as source (none added or dropped)", {r[0] for r in rows} == set(srcitems))
bad = []
for (iid, stem, choices, keys, notes, expl, year, *_r, media) in rows:
    s = srcitems.get(iid)
    if not s: continue
    exp_keys = list(range(len(s["choices"]))) if s["key"] == "free" else [k - 1 for k in s["key"]]
    if stem != s["stem"] or choices != s["choices"] or list(keys) != exp_keys or expl != [s["k"]] or notes != s.get("e") or str(year or "") != str(s.get("year") or ""):
        bad.append(iid)
check("every item unchanged (stem, choices, key, k→explanation, e→choice_notes, year)", not bad, f"{len(bad)} differ {bad[:3]}")
m6j = json.load(open(os.path.join(ROOT, "content/m6/m6_items.json"), encoding="utf-8"))
ns_src = sum(1 for r in m6j if r["no_shuffle"]); ns_db = sum(1 for r in rows if r[9])
check("ม.6 shuffle rule kept (fixedWhy items unshuffled)", ns_src == ns_db, f"{ns_db} fixed / {827 - ns_db} shuffled")
free = sum(1 for r in rows if (r[10] or {}).get("key_free"))
check("'free' keys = every choice accepted", free == sum(1 for s in srcitems.values() if s["key"] == "free"), f"{free} items")
sets = c.execute("select count(*), count(*) filter (where item_ids is null) from exam_sets where grade_code='M6'").fetchone()
check("ม.6 mock sets imported", sets[0] > 0, f"{sets[0]} sets ({sets[1]} m6_app_mmix draws)")
leak = re.compile(r"SALT|ROOM_CODE|password|apiKey|firebase|script\.google", re.I)
files = os.listdir(os.path.join(ROOT, "content/m6/banks"))
hits = [f for f in files if leak.search(open(os.path.join(ROOT, "content/m6/banks", f), encoding="utf-8").read())]
check("copied files are banks only, no secrets/accounts", all(f.endswith("_bank.js") for f in files) and not hits, f"{len(files)} files, hits {hits}")
url = open(os.path.join(ROOT, "apps/web/js/eg-data.js"), encoding="utf-8").read()
check("transitional link to existing ม.6 app", "https://kruom9.github.io/kruom-cefr/examgym/m6-ios/" in url)
print(f"\n{ok}/{ok + fail} passed"); sys.exit(1 if fail else 0)
