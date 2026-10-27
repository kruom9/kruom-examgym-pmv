#!/usr/bin/env python3
"""E2E: landing → register → grade picker (remembered) → subject → practice → exam → result saved in DB.
Runs at 1280x800 and 390x844 against the LOCAL stack only (every non-localhost request is blocked and counted).
Usage: python3 tests/e2e_student.py [--shots DIR]"""
import json, os, re, sys, time, urllib.request
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KEYS = dict(l.strip().split("=", 1) for l in open(os.path.join(ROOT, ".local/keys.env")) if "=" in l)
APP = "http://127.0.0.1:8080/web/"
SHOTS = sys.argv[sys.argv.index("--shots") + 1] if "--shots" in sys.argv else None
def rest(path):
    r = urllib.request.Request("http://127.0.0.1:54321/rest/v1/" + path, headers={"apikey": KEYS["SERVICE_ROLE_KEY"], "Authorization": "Bearer " + KEYS["SERVICE_ROLE_KEY"]})
    return json.load(urllib.request.urlopen(r))
results = []
def check(name, ok, info=""):
    results.append((name, bool(ok), info)); print(("PASS " if ok else "FAIL ") + name + (f" · {info}" if info else ""))
def run(pw, vp, tag):
    b = pw.chromium.launch(); ctx = b.new_context(viewport=vp, locale="th-TH", device_scale_factor=2 if vp["width"] < 500 else 1)
    page = ctx.new_page(); errors, external = [], []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    def guard(route):
        u = route.request.url
        if re.match(r"^https?://(127\.0\.0\.1|localhost)(:\d+)?/", u) or u.startswith("data:"): return route.continue_()
        external.append(u); return route.abort()
    ctx.route("**/*", guard)
    page.on("dialog", lambda d: d.accept())
    def shot(n, full=True):
        if not SHOTS: return
        page.evaluate("document.querySelectorAll('.eg-toast').forEach(t => t.remove())"); page.wait_for_timeout(150)
        page.screenshot(path=os.path.join(SHOTS, f"kruom_{n}_{tag}.png"), full_page=full)
    page.goto(APP); page.wait_for_selector("[data-test=start]"); shot("01_landing")
    check(f"[{tag}] landing shows ม.6 live-login link", page.get_attribute("[data-test=m6-login]", "href").startswith("https://kruom9.github.io/kruom-cefr/examgym/m6-ios/"))
    page.click("[data-test=start]"); page.wait_for_selector("#reg")
    page.click("[data-test=register]"); page.wait_for_selector(".eg-field--err"); shot("02_register_errors")
    name = f"เด็กหญิงทดสอบ ระบบ{tag}"
    page.fill("#r_name", name); page.select_option("#r_school", "โรงเรียนปิยมิตรวิทยา"); page.fill("#r_line", f"test_{tag}")
    page.check("#r_consent"); shot("03_register")
    page.click("[data-test=register]"); page.wait_for_selector("[data-test=grade-M1]")
    check(f"[{tag}] picker has no default grade", page.locator(".eg-tile--sel").count() == 0)
    check(f"[{tag}] ม.6 card links to live app", page.get_attribute("[data-test=grade-M6]", "href").startswith("https://kruom9.github.io/"))
    shot("04_picker")
    page.click("[data-test=grade-M1]"); page.wait_for_selector("#p_room"); page.select_option("#p_room", "ม.1/2"); shot("05_picker_room")
    page.click("[data-test=confirm-grade]"); page.wait_for_selector("[data-test=subj-MA]"); shot("06_home_M1")
    uid = page.evaluate("JSON.parse(localStorage.getItem('examgym-auth')).user.id")
    prof = rest(f"profiles?id=eq.{uid}&select=grade_code,room,nick,full_name")[0]
    check(f"[{tag}] grade remembered on profile", prof["grade_code"] == "M1" and prof["room"] == "ม.1/2", json.dumps(prof, ensure_ascii=False))
    page.reload(); page.wait_for_selector("[data-test=subj-MA]")
    check(f"[{tag}] reload goes straight to ม.1 (picker remembered)", page.locator("[data-test=change-grade]").count() == 1)
    check(f"[{tag}] all 5 ม.1 subjects live with Helix drafts", all("ยังต้องเติม" not in page.inner_text(f"[data-test=subj-{c}]") for c in ("MA", "SC", "EN", "TH", "SO")))
    page.click("[data-test=subj-MA]"); page.wait_for_selector("[data-test=practice-weakest]"); shot("07_subject_M1_MA")
    page.click("[data-test=strand-M1-MA-T01]")
    for k in range(5):
        page.wait_for_selector(".eg-choice"); page.locator(".eg-choice").nth(k % 4).click()
        if k == 0: shot("08_practice_question")
        page.click("[data-test=check]"); page.wait_for_selector(".eg-explain")
        if k == 0: shot("09_practice_feedback")
        page.click("[data-test=next]")
    page.wait_for_selector("[data-test=result]"); shot("10_practice_result", False)
    check(f"[{tag}] practice result saved", "บันทึกผลแล้ว" in page.inner_text("[data-test=result]"))
    # exam room (unlock via test hook; the real rule = subject mastery ≥ 70%)
    page.evaluate("__EG.unlockAll()"); page.goto(APP + "#/s/M1-MA"); page.wait_for_selector("[data-test='set-M1-ROOM-MA']")
    page.click("[data-test='set-M1-ROOM-MA']"); page.wait_for_selector("[data-test=submit]"); shot("11_exam")
    n = page.locator(".eg-qnav button").count()
    for k in range(n):
        page.locator(".eg-choice").first.click()
        if k == 2: page.click("text=△ ทำเครื่องหมายทบทวน")
        if k + 1 < n: page.click("[data-test=nextq]")
    shot("12_exam_done")
    page.click("[data-test=submit]"); page.wait_for_selector("[data-test=result]"); shot("13_exam_result", False)
    txt = page.inner_text("[data-test=result]")
    att = rest(f"attempts?student_id=eq.{uid}&select=kind,n_items,n_correct,score_pct,exam_set_id&order=created_at")
    check(f"[{tag}] DB has practice + subject_room attempts", [a["kind"] for a in att] == ["practice", "subject_room"], json.dumps(att, ensure_ascii=False))
    ex = att[-1]; check(f"[{tag}] server score shown == DB", f"{ex['n_correct']}/{ex['n_items']}" in txt and ex["n_items"] == n, f"{ex['n_correct']}/{ex['n_items']}")
    ans = rest(f"answers?student_id=eq.{uid}&select=time_ms")
    check(f"[{tag}] every answer has time_ms", len(ans) == 5 + n and all(a["time_ms"] is not None for a in ans), f"{len(ans)} answers")
    page.click("text=หน้าหลัก"); page.wait_for_selector("[data-test=history]"); page.click("[data-test=history]"); page.wait_for_selector(".eg-table"); shot("14_history")
    # change grade → picker shows current grade; M2 grade has no items yet = เร็ว ๆ นี้
    page.goto(APP + "#/"); page.click("[data-test=change-grade]"); page.wait_for_selector("[data-test=grade-M2]")
    check(f"[{tag}] change-grade picker reachable", "ตอนนี้" in page.inner_text("main"))
    page.goto(APP + "#/m6"); page.wait_for_selector("[data-test=m6-go]"); shot("15_m6")
    check(f"[{tag}] ม.6 subject without content (คณิต) shows ยังต้องเติม", "ยังต้องเติม" in page.inner_text("main"))
    # teacher dashboard (same design system) — local test teacher from tests/make_teacher.py
    page.evaluate("localStorage.removeItem('examgym-auth')"); page.goto(APP + "#/teacher"); page.reload(); page.wait_for_selector("#tlogin"); shot("16_teacher_login")
    page.fill("#t_email", "teacher.m1@examgym.local"); page.fill("#t_pw", "local-teacher-pass-1"); page.click("[data-test=tlogin]")
    page.wait_for_selector("text=รายคน"); shot("17_teacher_dashboard")
    try: page.wait_for_selector(f"main >> text={name}", timeout=8000)
    except Exception: pass
    check(f"[{tag}] teacher sees this student", name in page.inner_text("main"))
    check(f"[{tag}] 0 console errors", not errors, "; ".join(errors[:3]))
    check(f"[{tag}] no non-localhost requests", not external, "; ".join(external[:3]))
    b.close()
with sync_playwright() as pw:
    for vp, tag in (({"width": 1280, "height": 800}, "desktop"), ({"width": 390, "height": 844}, "mobile")):
        run(pw, vp, tag)
bad = [r for r in results if not r[1]]
print(f"\n{len(results) - len(bad)}/{len(results)} passed"); sys.exit(1 if bad else 0)
