#!/usr/bin/env python3
"""Teacher-review PDFs, one per grade+subject (ม.1–ม.5 Helix drafts): every item with level, choices, answer,
explanation, verification mode and any review flag. Rendered offline with the bundled Sarabun (no network).
Usage: python3 tools/make_pdfs.py OUT_DIR"""
import json, os, sys, html
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
import base64
b64 = lambda p, mt: f"data:{mt};base64," + base64.b64encode(open(os.path.join(ROOT, p), "rb").read()).decode()
F4, F7 = b64("apps/web/assets/fonts/Sarabun-400.ttf", "font/ttf"), b64("apps/web/assets/fonts/Sarabun-700.ttf", "font/ttf")
LOGO = b64("apps/web/assets/art/piyamit-logo-256.png", "image/png")
K = "กขคง"; e = html.escape
CSS = f"""@font-face{{font-family:Sarabun;src:url('{F4}')}}@font-face{{font-family:Sarabun;font-weight:700;src:url('{F7}')}}
body{{font-family:Sarabun;font-size:11.5pt;color:#1c1c1e;margin:0}} h1{{font-size:18pt;color:#FF2D55;margin:0}} h2{{font-size:13.5pt;margin:18px 0 6px;border-bottom:2px solid #FF2D55;padding-bottom:3px}}
.hd{{display:flex;gap:12px;align-items:center;margin-bottom:6px}} .hd img{{width:46px}} .meta{{color:#636366;font-size:10pt}}
.draft{{display:inline-block;background:#FFF4CC;color:#7a5b00;border-radius:6px;padding:1px 8px;font-size:9.5pt;font-weight:700}}
.q{{break-inside:avoid;border:1px solid #e5e5ea;border-radius:10px;padding:8px 12px;margin:8px 0}} .qh{{font-size:9.5pt;color:#636366}}
.stem{{font-weight:700;margin:3px 0 4px;white-space:pre-wrap}} .c{{margin:1px 0 1px 10px}} .ok{{color:#1e7a34;font-weight:700}}
.ex{{background:#f2f2f7;border-radius:6px;padding:4px 8px;margin-top:4px;font-size:10.5pt}} .flag{{background:#FFE5EA;color:#b00030;border-radius:6px;padding:3px 8px;margin-top:4px;font-size:10pt}}"""
n_pdf = 0
with sync_playwright() as pw:
    b = pw.chromium.launch(); pg = b.new_page()
    pg.route("**/*", lambda r: r.continue_() if r.request.url.startswith("data:") else r.abort())
    for g in range(1, 6):
        d = json.load(open(os.path.join(ROOT, f"content/items/m{g}.json"), encoding="utf-8"))
        for s in d["subjects"]:
            items = [i for i in d["items"] if i["subject"] == s["code"]]
            if not items: continue
            body = [f"<div class='hd'><img src='{LOGO}'><div><h1>Exam Gym ปิยมิตรมัธยม · ม.{g} {e(s['name'])}</h1>"
                    f"<div class='meta'>{e(', '.join(s['courses']))} {e(s['course_name'])} · ภาคเรียนที่ 2 · {len(items)} ข้อ · "
                    f"ที่มา: Helix topic, draft <span class='draft'>ฉบับร่าง · รอครูตรวจ</span></div></div></div>"
                    "<div class='meta'>ข้อสอบแต่งใหม่ทั้งหมด (ไม่คัดลอกข้อสอบจริง) · ระดับ: ตั้งไข่ / ง่าย / กลาง / ยาก · "
                    "“คำนวณตรวจแล้ว” = คำตอบถูกตรวจด้วยการคำนวณอัตโนมัติ · กล่องสีชมพู = ข้อที่ครูควรดูเป็นพิเศษ</div>"]
            for t in [t for t in d["topics"] if t["subject"] == s["code"]]:
                ti = [i for i in items if i["topic_no"] == t["no"]]
                body.append(f"<h2>บทที่ {t['no']} {e(t['title'])}</h2><div class='meta'>{e(t['subs'] or '')}</div>")
                for n, i in enumerate(ti, 1):
                    ch = "".join(f"<div class='c{' ok' if k == i['answer'] else ''}'>{K[k]}. {e(c)}{' ✓' if k == i['answer'] else ''}</div>" for k, c in enumerate(i["choices"]))
                    body.append(f"<div class='q'><div class='qh'>{e(i['id'])} · ระดับ{e(i['levelName'])} · {'คำนวณตรวจแล้ว' if i.get('verified') == 'computed' else 'ตรวจด้วยตนเอง'}"
                                f"{' · ไม่สลับตัวเลือก' if i.get('no_shuffle') else ''}</div><div class='stem'>{n}. {e(i['question'])}</div>{ch}"
                                f"<div class='ex'>เฉลย {K[i['answer']]} · {' '.join(e(x) for x in i['explanation'])}</div>"
                                + (f"<div class='flag'>⚑ ให้ครูตรวจ: {e(i['review_flag'])}</div>" if i.get("review_flag") else "") + "</div>")
            pg.set_content(f"<html><head><meta charset='utf-8'><style>{CSS}</style></head><body>{''.join(body)}</body></html>", wait_until="load")
            name = f"kruom_questions_M{g}_{s['code']}.pdf"
            pg.pdf(path=os.path.join(OUT, name), format="A4", margin={"top": "14mm", "bottom": "14mm", "left": "13mm", "right": "13mm"},
                   display_header_footer=True, header_template="<div></div>",
                   footer_template="<div style='font-size:8pt;width:100%;text-align:center;color:#888'>Exam Gym ปิยมิตรมัธยม · ฉบับร่าง · หน้า <span class='pageNumber'></span>/<span class='totalPages'></span></div>")
            n_pdf += 1; print(name, len(items))
    b.close()
print(n_pdf, "PDFs")
