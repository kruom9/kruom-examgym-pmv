#!/usr/bin/env python3
"""Build content/items/*.json from the compact authoring files content/src/m{g}.txt and verify them.

Authoring format (one item per line, fields separated by '|'):
  @S <SUBJ> <course codes comma-sep> <subject name>
  @T <chapter no> <chapter title> | <sub-topics from Helix ผังการเรียน> [| flag text]
  <level 0-3>|<stem>|<CORRECT choice>|<distractor>|<distractor>|<distractor>|<explanation>[|chk=<python expr>][|flag=<note>][|ns][|abcd]
The correct choice is always written first; the builder moves it to a balanced, seeded position
(unless 'ns' = keep order; 'abcd' = sort choices, e.g. A/B/C/D error-identification labels). chk= expressions are evaluated (math verification): numeric value must equal the
number in the correct choice and differ from every distractor; a bool expression must be True.
"""
import json, re, random, sys, os, hashlib
from fractions import Fraction as F
from math import *
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SUP = str.maketrans("⁰¹²³⁴⁵⁶⁷⁸⁹⁻", "0123456789-")
SUBJ_NAMES = {"MA":"คณิตศาสตร์","SC":"วิทยาศาสตร์","EN":"ภาษาอังกฤษ","TH":"ภาษาไทย","SO":"สังคมศึกษา","PH":"ฟิสิกส์","CH":"เคมี","BI":"ชีววิทยา"}
LV = ["ตั้งไข่","ง่าย","กลาง","ยาก"]

def num(s):
    """first number in a choice: handles −, commas, a/b, a : b, 3.2 × 10⁵, 2⁷, %"""
    t = str(s).replace("−","-").replace("–","-").replace(",","")
    m = re.search(r"(-?\d+(?:\.\d+)?)\s*[×x]\s*10([⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+)", t)
    if m: return F(m.group(1)) * F(10) ** int(m.group(2).translate(SUP))
    m = re.search(r"(-?\d+(?:\.\d+)?)([⁰¹²³⁴⁵⁶⁷⁸⁹]+)", t)
    if m: return F(m.group(1)) ** int(m.group(2).translate(SUP))
    m = re.search(r"(-?\d+)\s+(\d+)/(\d+)", t)
    if m: a=int(m.group(1)); return F(a) + (1 if a>=0 else -1)*F(int(m.group(2)), int(m.group(3)))
    m = re.search(r"(-?\d+(?:\.\d+)?)\s*(?:/|:)\s*(\d+(?:\.\d+)?)(?!\s*:)", t)
    if m: return F(m.group(1)) / F(m.group(2))
    m = re.search(r"-?\d+(?:\.\d+)?", t)
    return F(m.group(0)) if m else None

def close(a, b):
    return abs(F(a) - F(b)) <= F(1, 10**6) * max(1, abs(F(b)))

def parse(path, grade):
    subj = None; topic = None; out = []; topics = []; subjects = []
    for ln, raw in enumerate(open(path, encoding="utf-8"), 1):
        line = raw.rstrip("\n")
        if not line.strip() or line.startswith("#"): continue
        if line.startswith("@S "):
            p = line[3:].split(" ", 2); subj = dict(code=p[0], courses=p[1].split(","), course_name=p[2], name=SUBJ_NAMES[p[0]])
            subjects.append(subj); continue
        if line.startswith("@T "):
            p = [x.strip() for x in line[3:].split("|")]
            no, title = p[0].split(" ", 1)
            topic = dict(subject=subj["code"], no=int(no), title=title, subs=p[1] if len(p) > 1 else "", flag=p[2] if len(p) > 2 else None, course=subj["courses"][0])
            topics.append(topic); continue
        f = [x.strip() for x in line.split("|")]
        if len(f) < 7: sys.exit(f"{path}:{ln}: need ≥7 fields, got {len(f)}: {line[:80]}")
        lv, stem, cor, d1, d2, d3, expl = f[:7]
        opt = {"ns": False}
        for x in f[7:]:
            if x == "ns": opt["ns"] = True
            elif x == "abcd": opt["abcd"] = True
            elif x.startswith("chk="): opt["chk"] = x[4:]
            elif x.startswith("flag="): opt["flag"] = x[5:]
            else: sys.exit(f"{path}:{ln}: unknown option {x}")
        out.append(dict(ln=ln, subject=subj["code"], topic=topic, level=int(lv), stem=stem, choices=[cor, d1, d2, d3], expl=expl, **opt))
    return subjects, topics, out

def build(grade):
    path = os.path.join(ROOT, "content", "src", f"m{grade}.txt")
    subjects, topics, raw = parse(path, grade)
    errors = []; items = []; verified = 0; unverifiable = 0
    per_topic = {}
    for it in raw:
        t = it["topic"]; key = (it["subject"], t["no"])
        per_topic.setdefault(key, []).append(it)
    for (sc, no), lst in per_topic.items():
        t = lst[0]["topic"]
        rng = random.Random(f"examgym-M{grade}-{sc}-{no}")
        slots = []
        for it in lst:
            if not slots: slots = [0, 1, 2, 3]; rng.shuffle(slots)
            pos = slots.pop()
            ch = it["choices"]
            if len(set(ch)) != 4: errors.append(f"line {it['ln']}: duplicate choices {ch}")
            if "chk" in it:
                try: v = eval(it["chk"])
                except Exception as e: errors.append(f"line {it['ln']}: chk error {e}"); v = None
                if isinstance(v, bool):
                    if not v: errors.append(f"line {it['ln']}: chk False")
                    else: verified += 1
                elif v is not None:
                    c = num(ch[0])
                    if c is None or not close(c, v): errors.append(f"line {it['ln']}: correct '{ch[0]}' ≠ computed {float(v)}")
                    else:
                        verified += 1
                        for d in ch[1:]:
                            dv = num(d)
                            if dv is not None and close(dv, v) and d.strip() != ch[0].strip():
                                errors.append(f"line {it['ln']}: distractor '{d}' also equals {float(v)}")
            else: unverifiable += 1
            if it["ns"]: order = [0, 1, 2, 3]; ans = 0
            elif it.get("abcd"):
                final = sorted(ch); ans = final.index(ch[0]); slots.append(pos)
            else:
                rest = ch[1:]; rng.shuffle(rest); order = None
                final = rest[:pos] + [ch[0]] + rest[pos:]; ans = pos
            choices = ch if it["ns"] else final
            n = sum(1 for x in items if x["subject"] == sc and x["topic_no"] == no) + 1
            items.append(dict(
                id=f"M{grade}-{sc}-T{no:02d}-{n:02d}", grade=f"M{grade}", subject=sc, topic_no=no, topic=t["title"],
                course_code=t["course"], level=it["level"], levelName=LV[it["level"]], question=it["stem"], choices=choices,
                answer=ans, explanation=[it["expl"]], hint=None, no_shuffle=it["ns"], status="draft",
                source="Helix topic, draft", review_flag=it.get("flag") or t.get("flag"),
                verified="computed" if "chk" in it else "manual-review"))
    # every topic needs ≥1 item at each level (adaptive engine pools)
    for (sc, no), lst in per_topic.items():
        lv = {i["level"] for i in lst}
        if lv != {0, 1, 2, 3}: errors.append(f"M{grade} {sc} บท {no}: levels present {sorted(lv)}")
    for t in topics:
        if (t["subject"], t["no"]) not in per_topic: errors.append(f"M{grade} {t['subject']} บท {t['no']} has no items")
    return dict(grade=f"M{grade}", subjects=subjects, topics=topics, items=items), errors, verified, unverifiable

if __name__ == "__main__":
    os.makedirs(os.path.join(ROOT, "content", "items"), exist_ok=True)
    allerr = []
    for g in [int(x) for x in (sys.argv[1:] or ["1","2","3","4","5"])]:
        if not os.path.exists(os.path.join(ROOT, "content", "src", f"m{g}.txt")): continue
        data, errs, ver, unv = build(g)
        json.dump(data, open(os.path.join(ROOT, "content", "items", f"m{g}.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        pos = [0]*4
        for i in data["items"]: pos[i["answer"]] += 1
        print(f"M{g}: {len(data['items'])} items, {len(data['topics'])} topics, computed-verified {ver}, manual {unv}, answer positions ก-ง {pos}, errors {len(errs)}")
        allerr += errs
    for e in allerr: print("  ERROR", e)
    sys.exit(1 if allerr else 0)
