/* Exam Gym · รายงานผู้บริหาร / ครู (teacher · director · admin only; rows limited by RLS + teaches_grade()) */
(function () {
  const U = window.EGUI, C = window.EGCore, D = window.EGData, esc = U.esc;
  const $app = document.getElementById("app");
  const S = { prof: null, cat: null, f: null, data: null };
  const STAFF = ["teacher", "director", "admin"];
  const ROLE_TH = { teacher: "ครู", director: "ผู้บริหาร", admin: "ผู้ดูแลระบบ" };
  const SECT_TH = { mattayom: "มัธยม", prathom: "ประถม" };
  const KIND_TH = { practice: "ฝึก", subject_room: "ห้องสอบวิชา", mock: "สอบเสมือนจริง" };
  const bkk = d => new Date(d.getTime() + 7 * 3600e3).toISOString().slice(0, 10);
  const render = html => { $app.innerHTML = html; U.hydrate($app); };
  const fmt = v => v == null ? "—" : String(v);
  const pct = v => v == null ? "—" : `${Number(v).toFixed(1).replace(/\.0$/, "")}%`;
  const gname = c => ((S.cat && S.cat.grades.find(g => g.code === c)) || {}).name_th || c;
  const when = t => t ? C.fmtDate(t) : "—";

  async function boot() {
    const u = await D.user();
    S.prof = u ? await D.profile() : null;
    if (!S.prof || !STAFF.includes(S.prof.role)) return scrLogin(S.prof ? { pw: "บัญชีนี้ไม่มีสิทธิ์ดูรายงาน (เฉพาะครูและผู้บริหาร)" } : null);
    const cat = await D.catalogue(); S.cat = cat;
    const today = new Date();
    S.f = S.f || { section: "", grade: "", subject: "", from: bkk(new Date(today.getTime() - 13 * 864e5)), to: bkk(today), kind: "", pass: 50 };
    return scrDash();
  }

  // ---------- login ----------
  function scrLogin(err, email) {
    err = err || {};
    render(U.topbar({ title: "รายงานผู้บริหาร", sub: "Exam Gym ปิยมิตรวิทยา", actions: U.btn("หน้าแรก", { kind: "text", sm: true, href: "../", test: "to-portal" }) })
      + U.page(U.split(
        U.card(`<form id="dlogin" class="eg-stack eg-login" novalidate>${U.h2("เข้าสู่ระบบครู / ผู้บริหาร")}`
          + U.field({ id: "d_email", label: "อีเมลของโรงเรียน", type: "email", auto: "username", value: email, err: err.email, ph: "name@piyamit.ac.th" })
          + U.field({ id: "d_pw", label: "รหัสผ่าน", type: "password", auto: "current-password", err: err.pw, reveal: true, help: "บัญชีครูและผู้บริหารสร้างโดยผู้ดูแลระบบเท่านั้น" })
          + U.btn("เข้าสู่ระบบ", { kind: "primary", type: "submit", test: "dlogin" }) + `</form>`),
        U.hero({ title: "รายงานภาพรวม", sub: "รายชื่อนักเรียน คะแนนรายวิชา ผ่าน/ไม่ผ่าน และการใช้งาน เห็นเฉพาะชั้นที่ได้รับสิทธิ์", mood: "grammar" })
        + U.card(U.h2("นักเรียน") + U.p("นักเรียนไม่ต้องเข้าสู่ระบบที่หน้านี้") + U.btns(U.btn("ฝ่ายมัธยม ›", { kind: "ghost", href: "../mattayom/" }) + U.btn("ฝ่ายประถม ›", { kind: "ghost", href: "../prathom/" }))))));
    document.getElementById("dlogin").addEventListener("submit", async e => {
      e.preventDefault();
      const em = document.getElementById("d_email").value.trim(), pw = document.getElementById("d_pw").value, E = {};
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) E.email = "กรุณากรอกอีเมลให้ถูกต้อง";
      if (!pw) E.pw = "กรุณากรอกรหัสผ่าน";
      if (Object.keys(E).length) return scrLogin(E, em);
      const b = e.target.querySelector("[data-test=dlogin]"); b.disabled = true; b.textContent = "กำลังเข้าสู่ระบบ…";
      try {
        const p = await D.teacherLogin(em, pw);
        if (!p || !STAFF.includes(p.role)) { await D.signOut(); return scrLogin({ pw: "บัญชีนี้ไม่มีสิทธิ์ดูรายงาน (เฉพาะครูและผู้บริหาร)" }, em); }
        boot();
      } catch (x) { console.warn(x); scrLogin({ pw: /invalid/i.test(x.message || "") ? "อีเมลหรือรหัสผ่านไม่ถูกต้อง" : "เข้าสู่ระบบไม่สำเร็จ: " + (x.message || x) }, em); }
    });
  }

  // ---------- dashboard ----------
  function args(f) {
    const n = v => v === "" || v == null ? null : v;
    return { p_section: n(f.section), p_grade: n(f.grade), p_subject: n(f.subject), p_from: n(f.from), p_to: n(f.to), p_kind: n(f.kind) };
  }
  async function load() {
    const a = args(S.f);
    const [students, scores, pass, daily, usage] = await Promise.all([
      D.rpc("dash_students", a), D.rpc("dash_subject_scores", a), D.rpc("dash_pass_summary", Object.assign({ p_pass_pct: Number(S.f.pass) || 50 }, a)),
      D.rpc("dash_daily_activity", a), D.rpc("dash_subject_activity", a)]);
    return { students, scores, pass, daily, usage };
  }
  function filters() {
    const f = S.f, G = S.cat.grades.filter(g => !f.section || g.section_code === f.section);
    const sel = (id, label, opts, cur) => U.field({ id, label, options: opts.map(([v, t]) => `<option value="${esc(v)}"${String(cur) === String(v) ? " selected" : ""}>${esc(t)}</option>`).join("") });
    const subs = S.cat.subjects.filter(s => (!f.grade || s.grade_code === f.grade) && G.some(g => g.code === s.grade_code));
    return U.card(`<form id="flt" class="eg-filters">`
      + sel("f_section", "ฝ่าย", [["", "ทุกฝ่าย"], ["mattayom", "มัธยม"], ["prathom", "ประถม"]], f.section)
      + sel("f_grade", "ชั้น", [["", "ทุกชั้น"]].concat(G.map(g => [g.code, g.name_th])), f.grade)
      + sel("f_subject", "วิชา", [["", "ทุกวิชา"]].concat(subs.map(s => [s.id, (f.grade ? "" : gname(s.grade_code) + " · ") + s.name_th])), f.subject)
      + sel("f_kind", "ประเภท", [["", "ทั้งหมด"], ["practice", "ฝึก"], ["subject_room", "ห้องสอบวิชา"], ["mock", "สอบเสมือนจริง"]], f.kind)
      + U.field({ id: "f_from", label: "ตั้งแต่วันที่", type: "date", value: f.from })
      + U.field({ id: "f_to", label: "ถึงวันที่", type: "date", value: f.to })
      + U.field({ id: "f_pass", label: "เกณฑ์ผ่าน (%)", type: "number", value: String(f.pass) })
      + U.btn("ดูรายงาน", { kind: "primary", type: "submit", test: "apply" }) + `</form>`);
  }
  async function scrDash() {
    render(U.topbar({ title: "รายงานผู้บริหาร", sub: `${S.prof.full_name || ""} · ${ROLE_TH[S.prof.role] || ""}`, actions: U.btn("ออก", { kind: "text", act: "signout", test: "signout" }) })
      + U.page(filters() + U.empty("กำลังโหลด…", "", "wait")));
    bindFilters();
    let d;
    try { d = S.data = await load(); }
    catch (x) { console.warn(x); return render(U.topbar({ title: "รายงานผู้บริหาร", back: null, actions: U.btn("ออก", { kind: "text", act: "signout" }) }) + U.page(U.empty("โหลดรายงานไม่สำเร็จ", String(x.message || x), "wait"))); }
    const totalStud = d.students.length, activeStud = d.students.filter(r => Number(r.n_attempts) > 0).length;
    const totalAtt = d.usage.reduce((a, r) => a + Number(r.n_attempts), 0);
    const passN = d.pass.reduce((a, r) => a + Number(r.n_pass), 0), passD = d.pass.reduce((a, r) => a + Number(r.n_students), 0);
    const P = Number(S.f.pass) || 50;
    const demo = d.students.some(r => /\(สมมติ\)/.test(r.full_name || ""));
    render(U.topbar({ title: "รายงานผู้บริหาร", sub: `${S.prof.full_name || ""} · ${ROLE_TH[S.prof.role] || ""}`, actions: U.btn("ออก", { kind: "text", act: "signout", test: "signout" }) })
      + U.page(
        (demo ? `<div class="eg-demo eg-card eg-card--flat" data-test="demo-banner">${U.note("ข้อมูลตัวอย่าง (สมมติ) สำหรับทดสอบในเครื่องเท่านั้น ไม่ใช่นักเรียนจริง", true)}</div>` : "")
        + filters()
        + U.card(U.stats([[totalStud, "นักเรียนที่ลงทะเบียน"], [activeStud, "ใช้งานในช่วงนี้"], [totalAtt, "จำนวนครั้งที่ทำ"], [passD ? Math.round(passN / passD * 100) + "%" : "—", `ผ่านเกณฑ์ ${P}%`]]), "hero", { "data-test": "kpis" })
        + U.note(`สมมติฐาน: เกณฑ์ผ่าน ${P}% (ค่าเริ่มต้น 50% จนกว่าโรงเรียนจะกำหนด) · นักเรียน "ผ่าน" เมื่อคะแนนสูงสุดในช่วงที่เลือก ≥ เกณฑ์ · เวลาเป็นเวลาไทย (UTC+7)`)
        + U.card(U.h2("คะแนนรายวิชา", U.badge(`${d.scores.length} แถว`)) + U.table([
            { t: "ชั้น", html: r => esc(gname(r.grade_code)) }, { k: "subject_name", t: "วิชา" }, { k: "n_students", t: "นักเรียน", num: true }, { k: "n_attempts", t: "ครั้ง", num: true },
            { t: "เฉลี่ย", num: true, html: r => pct(r.avg_pct) }, { t: "มัธยฐาน", num: true, html: r => pct(r.median_pct) }, { t: "ต่ำสุด", num: true, html: r => pct(r.min_pct) }, { t: "สูงสุด", num: true, html: r => pct(r.max_pct) }], d.scores), "", { "data-test": "t-scores" })
        + U.card(U.h2("ผ่าน / ไม่ผ่าน", U.badge(`เกณฑ์ ${P}%`, "pink")) + U.table([
            { t: "ชั้น", html: r => esc(gname(r.grade_code)) }, { k: "subject_name", t: "วิชา" }, { k: "n_students", t: "นักเรียน", num: true },
            { t: "ผ่าน", num: true, html: r => U.badge(fmt(r.n_pass), "ok", "✓") }, { t: "ไม่ผ่าน", num: true, html: r => U.badge(fmt(r.n_fail), "no", "✗") },
            { t: "อัตราผ่าน", num: true, html: r => pct(r.pass_rate) }, { t: "ครั้งที่ผ่าน/ทั้งหมด", num: true, html: r => `${r.n_attempts_pass}/${r.n_attempts}` }], d.pass), "", { "data-test": "t-pass" })
        + U.split(
          U.card(U.h2("การใช้งานรายวัน") + U.table([{ t: "วันที่", html: r => esc(new Date(r.day + "T12:00:00+07:00").toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short", year: "2-digit", timeZone: "Asia/Bangkok" })) }, { k: "n_active_students", t: "นักเรียนที่ใช้", num: true }, { k: "n_attempts", t: "ครั้ง", num: true }, { k: "n_items", t: "ข้อ", num: true }], d.daily), "", { "data-test": "t-daily" }),
          U.card(U.h2("การใช้งานรายวิชา") + U.table([{ t: "ชั้น", html: r => esc(gname(r.grade_code)) }, { k: "subject_name", t: "วิชา" }, { k: "n_practice", t: "ฝึก", num: true }, { k: "n_tests", t: "สอบ", num: true }, { k: "n_students", t: "คน", num: true }, { t: "ล่าสุด", html: r => esc(when(r.last_active)) }], d.usage), "", { "data-test": "t-usage" }))
        + U.card(U.h2("รายชื่อนักเรียน (ตามชั้น/ห้อง)", U.badge(`${totalStud} คน`)) + U.table([
            { t: "ฝ่าย", html: r => esc(SECT_TH[r.section_code] || "") }, { t: "ชั้น", html: r => esc(gname(r.grade_code)) }, { k: "room", t: "ห้อง" }, { k: "full_name", t: "ชื่อ" }, { k: "school", t: "โรงเรียน" },
            { k: "n_attempts", t: "ครั้ง", num: true }, { t: "เฉลี่ย", num: true, html: r => pct(r.avg_pct) }, { t: "สูงสุด", num: true, html: r => pct(r.best_pct) }, { t: "ใช้งานล่าสุด", html: r => esc(when(r.last_active)) }], d.students), "", { "data-test": "t-students" })
        + `<footer class="eg-foot"><img src="${U.BASE}assets/art/icon-64.png" alt="">โรงเรียนปิยมิตรวิทยา · รายงานนี้เห็นเฉพาะชั้นที่บัญชีได้รับสิทธิ์</footer>`));
    bindFilters();
  }
  function bindFilters() {
    const form = document.getElementById("flt"); if (!form) return;
    const v = id => document.getElementById(id).value;
    const read = () => ({ section: v("f_section"), grade: v("f_grade"), subject: v("f_subject"), kind: v("f_kind"), from: v("f_from"), to: v("f_to"), pass: Math.max(0, Math.min(100, Number(v("f_pass")) || 50)) });
    form.addEventListener("change", e => {
      if (e.target.id === "f_section" || e.target.id === "f_grade") { const n = read(); if (e.target.id === "f_section") n.grade = ""; n.subject = ""; S.f = n; const c = form.closest(".eg-card"); c.outerHTML = filters(); bindFilters(); }
    });
    form.addEventListener("submit", e => { e.preventDefault(); S.f = read(); scrDash(); });
  }
  document.addEventListener("click", async e => {
    const rv = e.target.closest("[data-reveal]");
    if (rv) { const i = document.getElementById(rv.dataset.reveal); const show = i.type === "password"; i.type = show ? "text" : "password"; rv.textContent = show ? "ซ่อน" : "แสดง"; return; }
    const el = e.target.closest("[data-act=signout]"); if (el) { await D.signOut(); S.prof = null; S.data = null; scrLogin(); }
  });
  window.__EGDash = { S, boot };
  boot().catch(e => { console.warn(e); render(U.page(U.empty("เชื่อมต่อระบบไม่สำเร็จ", String(e.message || e), "wait"))); });
})();
