#!/usr/bin/env python3
"""content/curriculum.json: grades → subjects → strands (บท).
ม.1–ม.5: Term 2 chapters from Helix ผังการเรียน (kruom_helix_term2_topics.md, read-only planning file).
ม.6: subjects/strands = saras of the existing Exam Gym ม.6 banks (content/m6/m6_manifest.json, built by import_m6.mjs)."""
import re, json, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MD = os.environ.get("HELIX_TOPICS_MD", "/workspace/kruom/examgym_pmv_plan/kruom_helix_term2_topics.md")
SUB = {"คณิตศาสตร์": "MA", "วิทยาศาสตร์": "SC", "ภาษาอังกฤษ": "EN", "ภาษาไทย": "TH", "สังคมศึกษา": "SO", "ฟิสิกส์": "PH", "เคมี": "CH", "ชีววิทยา": "BI"}
META = {  # icon, color (same palette on every grade)
    "MA": ("🔢", "#007AFF", "คณิตศาสตร์"), "SC": ("🔬", "#34C759", "วิทยาศาสตร์"), "EN": ("🔤", "#AF52DE", "ภาษาอังกฤษ"),
    "TH": ("📖", "#FF9500", "ภาษาไทย"), "SO": ("🌏", "#5AC8FA", "สังคมศึกษา"), "PH": ("🧲", "#5856D6", "ฟิสิกส์"),
    "CH": ("⚗️", "#FF3B30", "เคมี"), "BI": ("🧬", "#30B0C7", "ชีววิทยา"),
    "TG1": ("💬", "#AF52DE", "TGAT1 การสื่อสารภาษาอังกฤษ"), "TG2": ("🧠", "#FF9500", "TGAT2 การคิดอย่างมีเหตุผล"), "TG3": ("💼", "#8E8E93", "TGAT3 สมรรถนะการทำงาน")}
ORDER_LOWER = ["MA", "SC", "EN", "TH", "SO"]
ORDER_UPPER = ["PH", "CH", "BI", "MA", "EN", "TH", "SO"]
GNAME = {1: "มัธยมศึกษาปีที่ 1", 2: "มัธยมศึกษาปีที่ 2", 3: "มัธยมศึกษาปีที่ 3", 4: "มัธยมศึกษาปีที่ 4", 5: "มัธยมศึกษาปีที่ 5", 6: "มัธยมศึกษาปีที่ 6"}
SRC = "Helix ผังการเรียน 24 ต.ค. 2569"

def parse_md():
    out = {}; g = s = None; course = None; skip = False
    for line in open(MD, encoding="utf-8"):
        m = re.match(r"^#### ม\.(\d) · (\S+) — (\S+)", line)
        if m:
            g, s = int(m.group(1)), SUB[m.group(2)]; course = None
            out.setdefault(g, {}).setdefault(s, {"courses": [], "chapters": [], "mark": m.group(3)}); continue
        if line.startswith("### ") or line.startswith("## "): g = None; continue
        if g is None: continue
        m = re.match(r"^\*\*(\S+) ([^*]+)\*\* — (.*)", line)
        if m:
            course = m.group(1); skip = "⚠️" in m.group(3)
            out[g][s]["courses"].append({"code": course, "name": m.group(2).strip(), "term_unverified": skip}); continue
        m = re.match(r"^- บท (\d+): \*\*(.+?)\*\* — (.*)$", line.strip())
        if m and course:
            out[g][s]["chapters"].append({"no": int(m.group(1)), "title": m.group(2), "subs": [x.strip() for x in m.group(3).split(";") if x.strip()],
                                          "course": course, "term_unverified": skip})
    return out

def main():
    md = parse_md(); grades = []
    for g in range(1, 6):
        subs = []
        for i, sc in enumerate(ORDER_LOWER if g <= 3 else ORDER_UPPER):
            d = md.get(g, {}).get(sc, {"courses": [], "chapters": []})
            chs = [c for c in d["chapters"] if not c["term_unverified"]]
            excluded = [c["code"] for c in d["courses"] if c["term_unverified"]]
            courses = [c["code"] for c in d["courses"] if not c["term_unverified"]]
            ic, col, nm = META[sc]
            subs.append({"id": f"M{g}-{sc}", "code": sc, "name": nm, "icon": ic, "color": col, "course_codes": courses,
                         "course_name": next((c["name"] for c in d["courses"] if not c["term_unverified"]), None),
                         "status": "live" if chs else "needs_content", "sort": i + 1,
                         "note": (f"ไม่รวม {', '.join(excluded)} (รหัสเทอม 1 ใน Helix)" if excluded else None),
                         "strands": [{"id": f"M{g}-{sc}-T{c['no']:02d}", "no": c["no"], "name": c["title"], "concepts": c["subs"],
                                      "course_code": c["course"], "term": 2, "source": f"{SRC} · {c['course']}", "status": "live"} for c in chs]})
        grades.append({"code": f"M{g}", "name": GNAME[g], "short": f"ม.{g}", "status": "live", "sort": g, "subjects": subs})
    man = json.load(open(os.path.join(ROOT, "content", "m6", "m6_manifest.json"), encoding="utf-8"))
    subs = []
    for i, b in enumerate(man["banks"]):
        ic, col, _ = META[b["subject"]]; nm = b["name"]
        subs.append({"id": f"M6-{b['subject']}", "code": b["subject"], "name": nm, "icon": ic, "color": col, "course_codes": [b["exam_code"]] if b.get("exam_code") else [],
                     "course_name": b["title"], "status": "imported", "sort": i + 1,
                     "note": "คลังข้อสอบเดิมของ Exam Gym ม.6 (นำเข้าตามเดิม ไม่แก้ไข)" + (" · บทเรียนเทอม 2 ยังต้องเติม" if b["subject"] == "SO" else ""),
                     "strands": [{"id": f"M6-{b['subject']}-S{s['id']}", "no": s["id"], "name": s["name"], "concepts": [t["id"] + " " + t["name"] for t in s.get("topics", [])],
                                  "course_code": b.get("exam_code"), "term": None, "source": f"Exam Gym ม.6 ({man['source']['commit']}) · {b['title']}", "status": "live"} for s in b["saras"]]})
    subs.append({"id": "M6-MA", "code": "MA", "name": "คณิตศาสตร์", "icon": META["MA"][0], "color": META["MA"][1], "course_codes": [], "course_name": None,
                 "status": "needs_content", "sort": len(subs) + 1, "note": "ไม่มีข้อมูลเทอม 2 ใน Helix และไม่มีคลังใน Exam Gym ม.6 — ยังต้องเติม", "strands": []})
    grades.append({"code": "M6", "name": GNAME[6], "short": "ม.6", "status": "external", "sort": 6,
                   "external_url": "https://kruom9.github.io/kruom-cefr/examgym/m6-ios/", "subjects": subs})
    json.dump({"generated_from": [os.path.basename(MD), "content/m6/m6_manifest.json"], "grades": grades},
              open(os.path.join(ROOT, "content", "curriculum.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    for gr in grades:
        print(gr["code"], " · ".join(f"{s['code']}:{len(s['strands'])}{'' if s['status']!='needs_content' else '(ยังต้องเติม)'}" for s in gr["subjects"]))
main()
