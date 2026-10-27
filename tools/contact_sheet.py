#!/usr/bin/env python3
"""Contact sheets from kruom_* screenshots (local files only).
  kruom_consistency_sheet.png : one row per screen type, mobile + desktop side by side (same eg.css everywhere)
  kruom_overview_mobile_*.png / kruom_overview_desktop_*.png : every screenshot, grouped
Usage: python3 tools/contact_sheet.py SHOTS_DIR OUT_DIR"""
import os, sys, glob, math
from PIL import Image, ImageDraw, ImageFont
SH, OUT = sys.argv[1], sys.argv[2]
FONT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "apps/web/assets/fonts/Sarabun-700.ttf")
f = lambda s: ImageFont.truetype(FONT, s)
PINK, BG = (255, 45, 85), (242, 242, 247)
def thumb(p, w, hmax):
    im = Image.open(p).convert("RGB"); h = int(im.height * w / im.width); im = im.resize((w, h), Image.LANCZOS)
    return im.crop((0, 0, w, min(h, hmax)))
ROWS = [("01_landing", "หน้าแรก"), ("03_register", "ลงทะเบียน"), ("04_picker", "เลือกชั้น"), ("06_home_M1", "หน้าหลัก ม.1"),
        ("20_M4_home", "หน้าหลัก ม.4"), ("07_subject_M1_MA", "หน้าวิชา"), ("09_practice_feedback", "ฝึก + เฉลย"), ("11_exam", "ห้องสอบ"),
        ("13_exam_result", "ผลสอบ"), ("14_history", "ประวัติ"), ("15_m6", "ม.6 (ระบบเดิม)"), ("17_teacher_dashboard", "แดชบอร์ดครู"),
        ("D4_feedback_dark", "โหมดมืด")]
MW, DW, H = 220, 520, 440
W = 40 + 200 + MW + 30 + DW + 40
img = Image.new("RGB", (W, 120 + len(ROWS) * (H + 30)), BG); d = ImageDraw.Draw(img)
d.text((40, 30), "Exam Gym ปิยมิตรมัธยม · ระบบออกแบบเดียวกันทุกหน้า (eg.css)", font=f(30), fill=PINK)
d.text((40, 75), "ซ้าย: มือถือ 390×844 · ขวา: เดสก์ท็อป 1280×800 · ภาพจากระบบทดสอบในเครื่อง (ข้อมูลสมมติ)", font=f(18), fill=(90, 90, 95))
y = 120
for key, label in ROWS:
    m, dk = os.path.join(SH, f"kruom_{key}_mobile.png"), os.path.join(SH, f"kruom_{key}_desktop.png")
    if not (os.path.exists(m) and os.path.exists(dk)): print("missing", key); continue
    d.text((40, y + 10), label, font=f(24), fill=(28, 28, 30)); d.text((40, y + 45), key, font=f(14), fill=(140, 140, 145))
    a, b = thumb(m, MW, H), thumb(dk, DW, H)
    img.paste(a, (240, y)); img.paste(b, (240 + MW + 30, y))
    d.rectangle((240, y, 240 + MW - 1, y + a.height - 1), outline=(210, 210, 215)); d.rectangle((270 + MW, y, 270 + MW + DW - 1, y + b.height - 1), outline=(210, 210, 215))
    y += H + 30
img.save(os.path.join(OUT, "kruom_consistency_sheet.png")); print("kruom_consistency_sheet.png", img.size)
for tag, tw, th, cols in (("mobile", 180, 390, 8), ("desktop", 320, 200, 5)):
    files = sorted(glob.glob(os.path.join(SH, f"kruom_*_{tag}.png")))
    per = cols * 5
    for page in range(math.ceil(len(files) / per)):
        chunk = files[page * per:(page + 1) * per]; rows = math.ceil(len(chunk) / cols)
        sheet = Image.new("RGB", (30 + cols * (tw + 20), 90 + rows * (th + 50)), BG); dd = ImageDraw.Draw(sheet)
        dd.text((30, 25), f"Exam Gym ปิยมิตรมัธยม · {tag} · หน้า {page + 1}", font=f(26), fill=PINK)
        for i, p in enumerate(chunk):
            x, yy = 30 + (i % cols) * (tw + 20), 90 + (i // cols) * (th + 50)
            sheet.paste(thumb(p, tw, th), (x, yy)); dd.text((x, yy + th + 6), os.path.basename(p)[6:-len(tag) - 5], font=f(13), fill=(60, 60, 65))
        name = f"kruom_overview_{tag}_{page + 1}.png"; sheet.save(os.path.join(OUT, name)); print(name, sheet.size, len(chunk))
