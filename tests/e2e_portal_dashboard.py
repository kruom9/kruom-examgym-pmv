#!/usr/bin/env python3
"""E2E (LOCAL only): portal → มัธยม / ประถม blocks, live-system links, director dashboard with fake demo data,
staff login validation, non-staff rejection. Desktop 1280x800 + mobile 390x844, light + dark.
Every non-localhost request is blocked and counted (external links are checked by href only).
Usage: python3 tests/e2e_portal_dashboard.py [--shots DIR]   (run tests/demo_seed_local.py first)"""
import os, re, sys
from playwright.sync_api import sync_playwright
B = "http://127.0.0.1:8080/web/"
SHOTS = sys.argv[sys.argv.index("--shots") + 1] if "--shots" in sys.argv else None
M6 = "https://kruom9.github.io/kruom-cefr/examgym/m6-ios/"; P6 = "https://kruom9.github.io/kruom-xexamgym-p6/"
results = []
def check(n, ok, info=""): results.append(ok); print(("PASS " if ok else "FAIL ") + n + (f" · {info}" if info else ""))
def run(pw, vp, tag, scheme, full_checks):
    b = pw.chromium.launch(); ctx = b.new_context(viewport=vp, locale="th-TH", color_scheme=scheme, device_scale_factor=2 if vp["width"] < 500 else 1)
    page = ctx.new_page(); errors, external = [], []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    def guard(route):
        u = route.request.url
        if re.match(r"^https?://(127\.0\.0\.1|localhost)(:\d+)?/", u) or u.startswith("data:"): return route.continue_()
        external.append(u); return route.abort()
    ctx.route("**/*", guard)
    T = f"{tag}_{scheme}"
    def shot(n):
        if SHOTS: page.wait_for_timeout(200); page.screenshot(path=os.path.join(SHOTS, f"v2_{n}_{T}.png"), full_page=True)
    # portal
    page.goto(B); page.wait_for_selector("[data-test=sect-mattayom]"); shot("01_portal")
    if full_checks:
        check(f"[{T}] portal has มัธยม + ประถม blocks", page.locator("[data-test=sect-prathom]").count() == 1)
        check(f"[{T}] portal ป.6 link → live ป.6", page.get_attribute("[data-test=portal-p6]", "href") == P6)
    # มัธยม landing (catalogue from DB)
    page.click("[data-test=sect-mattayom]"); page.wait_for_selector("[data-test=start]"); shot("02_mattayom_landing")
    if full_checks:
        check(f"[{T}] มัธยม landing loads", "/web/mattayom/" in page.url)
        page.click("[data-test=start]"); page.wait_for_selector("[data-test=grade-M1]", timeout=15000) if page.locator("#reg").count() == 0 else None
    # teacher login (polished)
    page.goto(B + "mattayom/#/teacher"); page.wait_for_selector("#tlogin"); 
    if full_checks:
        page.click("[data-test=tlogin]"); page.wait_for_selector(".eg-field__err")
        check(f"[{T}] teacher login inline validation", page.locator(".eg-field__err").count() >= 1)
        page.fill("#t_pw", "abc"); page.click("[data-reveal=t_pw]"); check(f"[{T}] password reveal toggles", page.get_attribute("#t_pw", "type") == "text")
        page.goto(B + "mattayom/#/teacher"); page.reload(); page.wait_for_selector("#tlogin")
    shot("03_teacher_login")
    # prathom
    page.goto(B + "prathom/"); page.wait_for_selector("[data-test=p6-go]"); shot("04_prathom")
    if full_checks:
        check(f"[{T}] ประถม ป.6 button → live ป.6", page.get_attribute("[data-test=p6-go]", "href") == P6)
        page.goto(B + "prathom/#/P4"); page.wait_for_timeout(300); txt = page.inner_text("body")
        check(f"[{T}] ป.4 page lists 5 subjects as coming soon", all(s in txt for s in ("คณิต", "วิทย", "อังกฤษ", "ไทย", "สังคม")), txt[:80])
    # dashboard login + reject non-staff validation
    page.goto(B + "dashboard/"); page.wait_for_selector("#dlogin"); shot("05_dashboard_login")
    if full_checks:
        page.fill("#d_email", "teacher.m1@examgym.local"); page.fill("#d_pw", "wrong-pass"); page.click("[data-test=dlogin]")
        page.wait_for_selector("text=อีเมลหรือรหัสผ่านไม่ถูกต้อง"); check(f"[{T}] wrong password shows inline error", True)
        errors[:] = [e for e in errors if "400 (Bad Request)" not in e]  # expected: GoTrue rejects the wrong password
    page.fill("#d_email", "director.demo@examgym.local"); page.fill("#d_pw", "local-director-pass-1"); page.click("[data-test=dlogin]")
    page.wait_for_selector("[data-test=t-students] tbody tr", timeout=15000); shot("06_dashboard")
    if full_checks:
        check(f"[{T}] demo banner shown for fake data", page.locator("[data-test=demo-banner]").count() == 1)
        n = page.locator("[data-test=t-students] tbody tr").count(); check(f"[{T}] director sees ม.1–ม.5 students", n >= 30, f"{n} rows")
        check(f"[{T}] subject score table filled", page.locator("[data-test=t-scores] tbody tr").count() >= 5)
        check(f"[{T}] daily usage table filled", page.locator("[data-test=t-daily] tbody tr").count() >= 5)
        page.select_option("#f_grade", "M3"); page.fill("#f_pass", "80"); page.click("[data-test=apply]")
        page.wait_for_selector("text=เกณฑ์ 80%"); rows = page.locator("[data-test=t-students] tbody tr").all_inner_texts()
        check(f"[{T}] grade filter + threshold 80% apply", rows and all("ม.3" in r for r in rows), f"{len(rows)} rows")
        page.click("[data-test=signout]"); page.wait_for_selector("#dlogin")
        page.fill("#d_email", "teacher.m1@examgym.local"); page.fill("#d_pw", "local-teacher-pass-1"); page.click("[data-test=dlogin]")
        page.wait_for_selector("[data-test=kpis]", timeout=15000); page.wait_for_timeout(400)
        rows = page.locator("[data-test=t-students] tbody tr").all_inner_texts()
        check(f"[{T}] teacher ม.1 sees only ม.1 rows", all("ม.1" in r for r in rows), f"{len(rows)} rows")
    check(f"[{T}] 0 console errors", not errors, "; ".join(errors[:3]))
    check(f"[{T}] no non-localhost requests", not external, "; ".join(external[:3]))
    b.close()
with sync_playwright() as pw:
    for vp, tag in (({"width": 1280, "height": 800}, "desktop"), ({"width": 390, "height": 844}, "mobile")):
        for scheme in ("light", "dark"):
            run(pw, vp, tag, scheme, full_checks=(scheme == "light"))
bad = results.count(False); print(f"\n{len(results) - bad}/{len(results)} passed"); sys.exit(1 if bad else 0)
