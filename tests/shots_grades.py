#!/usr/bin/env python3
"""Screenshots of every grade's home + every subject page + first practice question (ม.1–ม.5), desktop 1280x800 and
mobile 390x844, plus dark-mode samples. LOCAL ONLY (non-localhost requests blocked and counted). Also asserts that
every subject page renders its Helix chapters with item counts and that there are 0 console errors.
Usage: python3 tests/shots_grades.py DIR"""
import json, os, re, sys
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = "http://127.0.0.1:8080/web/"; OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
CUR = json.load(open(os.path.join(ROOT, "content/curriculum.json"), encoding="utf-8"))
res = []
def check(n, ok, info=""): res.append(ok); print(("PASS " if ok else "FAIL ") + n + (f" · {info}" if info else ""))
def run(pw, vp, tag, scheme="light"):
    b = pw.chromium.launch(); ctx = b.new_context(viewport=vp, locale="th-TH", color_scheme=scheme, device_scale_factor=2 if vp["width"] < 500 else 1)
    errs, ext = [], []
    def guard(route):
        u = route.request.url
        if re.match(r"^https?://(127\.0\.0\.1|localhost)(:\d+)?/", u) or u.startswith("data:"): return route.continue_()
        ext.append(u); return route.abort()
    ctx.route("**/*", guard)
    for g in CUR["grades"]:
        if g["code"] == "M6": continue
        if scheme == "dark" and g["code"] != "M4": continue
        page = ctx.new_page(); page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None); page.on("pageerror", lambda e: errs.append(str(e)))
        def shot(n, full=True):
            page.evaluate("document.querySelectorAll('.eg-toast').forEach(t => t.remove())"); page.wait_for_timeout(150)
            page.screenshot(path=os.path.join(OUT, f"kruom_{n}_{tag}.png"), full_page=full)
        page.goto(APP); page.evaluate("localStorage.clear()"); page.reload(); page.wait_for_selector("[data-test=start]")
        if scheme == "dark": shot("D1_landing_dark")
        page.click("[data-test=start]"); page.wait_for_selector("#reg")
        page.fill("#r_name", f"นักเรียนทดสอบ {g['short']} (สมมติ)"); page.select_option("#r_school", "โรงเรียนปิยมิตรวิทยา"); page.fill("#r_line", f"shot_{g['code']}_{tag}")
        page.check("#r_consent"); page.click("[data-test=register]"); page.wait_for_selector(f"[data-test=grade-{g['code']}]")
        page.click(f"[data-test=grade-{g['code']}]"); page.wait_for_selector("#p_room"); page.select_option("#p_room", f"{g['short']}/1")
        page.click("[data-test=confirm-grade]"); page.wait_for_selector("[data-test=change-grade]")
        pre = "D2" if scheme == "dark" else f"20_{g['code']}"
        shot(f"{pre}_home" + ("_dark" if scheme == "dark" else ""))
        if scheme == "dark":
            s = g["subjects"][0]; page.goto(APP + f"#/s/{g['code']}-{s['code']}"); page.wait_for_selector("[data-test=practice-weakest]"); shot("D3_subject_dark")
            page.click("[data-test=practice-weakest]"); page.wait_for_selector(".eg-choice"); page.locator(".eg-choice").first.click(); page.click("[data-test=check]"); page.wait_for_selector(".eg-explain"); shot("D4_feedback_dark")
            page.close(); continue
        for i, s in enumerate(g["subjects"]):
            page.goto(APP + f"#/s/{g['code']}-{s['code']}"); page.wait_for_selector("[data-test=practice-weakest]")
            txt = page.inner_text("main"); nst = len(s.get("strands") or [])
            check(f"[{tag}] {g['code']} {s['code']} subject page: {nst} บท, no ยังต้องเติม", "ยังต้องเติม" not in txt and page.locator("[data-test^=strand-]").count() == nst, f"{page.locator('[data-test^=strand-]').count()} cards")
            shot(f"{pre}_s{i + 1}_{s['code']}")
        s = g["subjects"][0]; page.goto(APP + f"#/s/{g['code']}-{s['code']}"); page.wait_for_selector("[data-test=practice-weakest]")
        page.click("[data-test=practice-weakest]"); page.wait_for_selector(".eg-choice"); shot(f"{pre}_z_practice_{s['code']}")
        page.close()
    check(f"[{tag}/{scheme}] 0 console errors", not errs, "; ".join(errs[:3])); check(f"[{tag}/{scheme}] no non-localhost requests", not ext, "; ".join(ext[:3]))
    b.close()
with sync_playwright() as pw:
    for vp, tag in (({"width": 1280, "height": 800}, "desktop"), ({"width": 390, "height": 844}, "mobile")):
        run(pw, vp, tag); run(pw, vp, tag, "dark")
print(f"\n{sum(res)}/{len(res)} passed"); sys.exit(0 if all(res) else 1)
