/* Exam Gym ปิยมิตรมัธยม · screens + router. Composes EGUI components only (no page-specific styling). */
(function () {
  const U = window.EGUI, C = window.EGCore, D = window.EGData, esc = U.esc;
  const $app = document.getElementById("app");
  const ABBR = { MA: "คณ", SC: "วท", EN: "En", TH: "ทย", SO: "สค", PH: "ฟส", CH: "คม", BI: "ชว", TG1: "T1", TG2: "T2", TG3: "T3" };
  const S = { user: null, prof: null, cat: null, grade: null, items: null, sets: null, P: null, QS: null, X: null, last: null, tick: null };
  const SCHOOL_OTHER = "__other__";
  const isTeacher = () => S.prof && ["teacher", "director", "admin"].includes(S.prof.role);
  const SECTION = window.EG_SECTION || "mattayom", BASE = U.BASE || "";

  // ---------- helpers ----------
  const gradeOf = code => S.cat.grades.find(g => g.code === code);
  const countBy = (pred) => S.cat.counts.filter(pred).reduce((a, r) => a + Number(r.n), 0);
  const gradeCount = g => countBy(r => r.grade_code === g);
  const subjCount = sid => countBy(r => r.subject_id === sid);
  const strandCount = tid => countBy(r => r.strand_id === tid);
  const subjectsOf = g => S.cat.subjects.filter(s => s.grade_code === g);
  const strandsOfSubj = sid => S.cat.strands.filter(t => t.subject_id === sid);
  const appTitle = () => S.grade ? `Exam Gym ${gradeOf(S.grade).name_th}` : "Exam Gym ปิยมิตรมัธยม";
  const go = h => { if (location.hash === h) route(); else location.hash = h; };
  const uid = () => (S.user && S.user.id) || "anon";
  function render(html) {
    clearInterval(S.tick); S.tick = null;
    $app.innerHTML = html; U.hydrate($app); window.scrollTo(0, 0);
  }
  function fail(e) { console.warn(e); U.toast("เกิดข้อผิดพลาด: " + (e && e.message || e)); }

  async function boot() {
    S.cat = await D.catalogue();
    // this block shows only its own section's grades (grades.section_code is derived from the code: M* → mattayom)
    S.cat.grades = S.cat.grades.filter(g => (g.section_code || (g.code[0] === "P" ? "prathom" : "mattayom")) === SECTION);
    S.user = await D.user();
    S.prof = S.user ? await D.profile() : null;
    window.addEventListener("hashchange", route);
    route();
  }
  async function ensureGrade() {
    const g = S.prof && S.prof.grade_code;
    if (!g) return false;
    if (S.grade !== g || !S.items) {
      S.grade = g;
      const [items, sets] = await Promise.all([D.items(g), D.examSets(g)]);
      S.items = items; S.sets = sets;
      C.load(subjectsOf(g), S.cat.strands.filter(t => t.grade_code === g), items);
      S.P = C.loadP(uid(), g);
    }
    return true;
  }

  // ---------- router ----------
  async function route() {
    const parts = (location.hash.replace(/^#\/?/, "") || "").split("/").filter(Boolean);
    const r = parts[0] || "";
    try {
      if (r === "teacher") return scrTeacher(parts[1]);
      if (r === "m6") return scrM6();
      if (!S.prof) return r === "register" ? scrRegister() : scrLanding();
      if (isTeacher()) return go("#/teacher");
      if (r === "grades" || !S.prof.grade_code) return scrPicker(parts[1]);
      await ensureGrade();
      if (r === "s") return scrSubject(parts[1]);
      if (r === "p") return scrPractice(parts[1]);
      if (r === "x") return scrExam(parts[1]);
      if (r === "r") return scrResult(parts[1]);
      if (r === "h") return scrHistory();
      return scrHome();
    } catch (e) { fail(e); render(U.topbar({ title: "Exam Gym ปิยมิตรมัธยม", back: "#/" }) + U.page(U.empty("โหลดข้อมูลไม่สำเร็จ", String(e.message || e), "wait", U.btn("ลองใหม่", { kind: "primary", act: "reload" })))); }
  }

  // ---------- landing (before login) ----------
  function scrLanding() {
    const grades = S.cat.grades.map(g => gradeTile(g, false)).join("");
    render(U.topbar({ title: "Exam Gym ปิยมิตรมัธยม", sub: "โรงเรียนปิยมิตรวิทยา ฝ่ายมัธยม", actions: U.btn("เลือกฝ่าย", { kind: "text", sm: true, href: BASE || "../", test: "to-portal" }) + U.btn("ครู", { kind: "text", go: "#/teacher", test: "teacher-link" }) })
      + U.page(
        U.hero({ title: "Exam Gym ปิยมิตรมัธยม", sub: "ฝึกข้อสอบ ม.1–ม.5 ตามบทเรียนเทอม 2 · ตรวจให้ทันที · ใช้ฟรี", mood: "hello",
          extra: U.btns(U.btn("เริ่มลงทะเบียน", { kind: "light", go: "#/register", test: "start" })) })
        + U.card(U.h2("เริ่มใช้ใน 3 ขั้น") + `<div class="eg-steps"><div class="eg-step"><b>1</b>กรอกชื่อ โรงเรียน และ LINE ID (ไม่ต้องตั้งรหัสผ่าน)</div><div class="eg-step"><b>2</b>เลือกชั้นและห้องของตัวเอง</div><div class="eg-step"><b>3</b>เลือกวิชา ฝึกทีละบท แล้วเข้าห้องสอบ</div></div>`
          + U.note("ระบบจำเครื่องนี้ไว้ เปิดครั้งต่อไปจะเข้าหน้าชั้นของน้องทันที (ถ้าล้างข้อมูลเบราว์เซอร์ ต้องลงทะเบียนใหม่)"))
        + U.card(U.h2("นักเรียน ม.6") + U.p("ม.6 ใช้ Exam Gym ม.6 เดิมไปก่อน (เข้าสู่ระบบด้วยบัญชีเดิม) ระหว่างย้ายเข้าระบบใหม่")
          + U.btns(U.btn("ไป Exam Gym ม.6 (ระบบเดิม) ↗", { kind: "ghost", href: D.M6_URL, test: "m6-login" })))
        + U.h2("ชั้นที่เปิดให้ฝึก") + U.grid(grades, 3) + U.foot()));
  }
  function gradeTile(g, interactive) {
    const n = gradeCount(g.code);
    if (g.status === "external") return U.gradeCard({ icon: g.name_th.slice(-1), title: `Exam Gym ${g.name_th}`, sub: `ระบบ ม.6 เดิม · ${n} ข้อในคลัง`, end: U.badge("ระบบเดิม ↗", "pink"), href: g.external_url || D.M6_URL, test: "grade-" + g.code });
    if (g.status !== "live" || !n) return U.gradeCard({ icon: g.name_th.slice(-1), title: `Exam Gym ${g.name_th}`, sub: "กำลังเตรียมข้อสอบ", end: U.soon(), muted: true, test: "grade-" + g.code });
    const subs = subjectsOf(g.code).filter(s => subjCount(s.id)).length;
    return U.gradeCard({ icon: g.name_th.slice(-1), title: `Exam Gym ${g.name_th}`, sub: `${subs} วิชา · ${n} ข้อ (ร่าง รอครูตรวจ)`, end: U.badge("เปิดแล้ว", "ok", "✓"),
      act: interactive ? "pick" : null, arg: g.code, go: interactive ? null : "#/register", sel: interactive && S.pick === g.code, test: "grade-" + g.code });
  }

  // ---------- register (3 fields + consent; grade is chosen next) ----------
  function scrRegister(err) {
    err = err || {}; const F = S.form || {};
    const opts = `<option value="">— เลือกโรงเรียน —</option>` + (window.SCHOOLS || []).map(g => `<optgroup label="${esc(g.label)}">${g.schools.map(x => `<option value="${esc(x.name)}" data-code="${esc(x.code || "")}"${F.school === x.name ? " selected" : ""}>${esc(x.name)}</option>`).join("")}</optgroup>`).join("") + `<option value="${SCHOOL_OTHER}"${F.school === SCHOOL_OTHER ? " selected" : ""}>อื่น ๆ (พิมพ์ชื่อโรงเรียน)</option>`;
    render(U.topbar({ title: "ลงทะเบียน", sub: "Exam Gym ปิยมิตรมัธยม", back: "#/" }) + U.page(U.split(
      U.card(`<form id="reg" class="eg-stack" novalidate>`
        + U.h2("ลงทะเบียนก่อนเริ่มฝึก (ไม่ต้องตั้งรหัสผ่าน)")
        + U.field({ id: "r_name", label: "ชื่อ-นามสกุล นักเรียน", ph: "เช่น เด็กหญิงใจดี ตั้งใจเรียน", value: F.name, err: err.name, max: 80, auto: "name" })
        + U.field({ id: "r_school", label: "โรงเรียน", options: opts, err: err.school })
        + `<div id="f_other"${F.school === SCHOOL_OTHER ? "" : " hidden"}>` + U.field({ id: "r_other", label: "พิมพ์ชื่อโรงเรียน", ph: "เช่น โรงเรียนบ้าน…", value: F.other, err: err.other, max: 80 }) + `</div>`
        + U.field({ id: "r_line", label: "LINE ID (ของนักเรียนหรือผู้ปกครอง)", ph: "เช่น kruom9", value: F.line, err: err.line, max: 30 })
        + U.note("ขั้นถัดไป: เลือกชั้นของตัวเอง (ม.1–ม.6) และห้อง")
        + U.check("r_consent", "ข้าพเจ้ารับทราบว่าโรงเรียนจะเก็บชื่อ โรงเรียน ชั้น LINE ID และผลการฝึก เพื่อใช้ติดตามการเรียนเท่านั้น ไม่เปิดเผยต่อบุคคลอื่น และขอลบข้อมูลได้ทุกเมื่อ", F.consent)
        + (err.consent ? U.note(esc(err.consent), true) : "")
        + U.btn("รับทราบและลงทะเบียน", { kind: "primary", type: "submit", test: "register" }) + `</form>`),
      U.hero({ title: "สวัสดี!", sub: "ฝึกวันละ 10 ข้อ ระบบปรับระดับความยากให้เอง ผลการฝึกจะบันทึกให้ครูช่วยดูแล", mood: "cheer" })
      + U.card(U.h2("ข้อมูลที่เก็บ") + `<ul class="eg-list eg-sm eg-mut"><li>ชื่อ โรงเรียน LINE ID ชั้นและห้อง</li><li>คำตอบและเวลาที่ใช้ในแต่ละข้อ</li><li>ไม่เก็บเลขประจำตัวประชาชน ไม่เก็บรูปถ่าย</li></ul>`)
    )));
    document.getElementById("r_school").addEventListener("change", e => { document.getElementById("f_other").hidden = e.target.value !== SCHOOL_OTHER; });
    document.getElementById("reg").addEventListener("submit", async e => {
      e.preventDefault(); const v = id => document.getElementById(id).value.trim();
      const sel = document.getElementById("r_school"); const code = sel.selectedOptions[0] && sel.selectedOptions[0].dataset.code;
      const F = S.form = { name: v("r_name").replace(/\s+/g, " "), school: sel.value, other: v("r_other"), line: v("r_line"), consent: document.getElementById("r_consent").checked };
      const E = {};
      if (F.name.length < 3) E.name = "กรุณากรอกชื่อ-นามสกุล";
      if (/\d{13}/.test(F.name + F.line + F.other)) E.name = "ห้ามกรอกเลขประจำตัวประชาชน";
      if (!F.school) E.school = "กรุณาเลือกโรงเรียน";
      if (F.school === SCHOOL_OTHER && F.other.length < 2) E.other = "กรุณาพิมพ์ชื่อโรงเรียน";
      if (!/^[A-Za-z0-9._@-]{1,30}$/.test(F.line)) E.line = "LINE ID ใช้ได้เฉพาะ a-z 0-9 . _ - @";
      if (!F.consent) E.consent = "กรุณาติ๊กรับทราบการเก็บข้อมูลก่อนลงทะเบียน";
      if (Object.keys(E).length) return scrRegister(E);
      try {
        const btn = e.target.querySelector("[data-test=register]"); btn.disabled = true;
        S.prof = await D.register({ name: F.name, school: F.school === SCHOOL_OTHER ? F.other : F.school, code: F.school === SCHOOL_OTHER ? null : code, line: F.line, consent: true, src: new URLSearchParams(location.search).get("src") });
        S.user = await D.user(); S.form = null; U.toast(`ลงทะเบียนแล้ว สวัสดีน้อง${S.prof.nick}`); go("#/grades");
      } catch (x) { fail(x); scrRegister({ consent: "ลงทะเบียนไม่สำเร็จ: " + x.message }); }
    });
  }

  // ---------- grade picker (no default; remembered on the profile) ----------
  function scrPicker() {
    const cur = S.prof.grade_code; const pick = S.pick || null; const g = pick && gradeOf(pick);
    const rooms = g ? [g.name_th].concat(Array.from({ length: g.room_max }, (_, i) => `${g.name_th}/${i + 1}`)) : [];
    const roomSel = g ? U.card(U.h2(`ห้องของน้องใน ${g.name_th}`) + U.field({ id: "p_room", label: "ห้อง", options: rooms.map(r => `<option${(S.prof.room === r) ? " selected" : ""}>${esc(r)}</option>`).join("") })
      + U.btn(`ยืนยัน ${g.name_th}`, { kind: "primary", act: "confirm-grade", arg: g.code, test: "confirm-grade" }), "", { id: "roompick" }) : "";
    render(U.topbar({ title: "เลือกชั้น", sub: `น้อง${S.prof.nick} · ${S.prof.school}`, back: cur ? "#/" : null, actions: U.btn("ออก", { kind: "text", act: "signout" }) })
      + U.page(U.hero({ title: cur ? "เปลี่ยนชั้น" : "น้องเรียนชั้นไหน?", sub: "เลือกชั้นของตัวเอง ระบบจะจำไว้ และเปลี่ยนได้ภายหลังจากหน้าหลัก", mood: "hello" })
        + (cur ? U.note(`ตอนนี้: ${esc(gradeOf(cur).name_th)} ${esc(S.prof.room || "")}`) : "")
        + U.grid(S.cat.grades.map(x => gradeTile(x, true)).join(""), 3) + roomSel + U.foot()));
    if (g) document.getElementById("roompick").scrollIntoView({ block: "center" });
  }

  // ---------- grade home: subjects + exam sets ----------
  function scrHome() {
    const g = gradeOf(S.grade), St = C.stats(S.P), sk = C.streak(S.P);
    const subs = subjectsOf(S.grade).map(s => {
      const n = C.nItems(s.id), tids = C.strandsOf(s.id), gm = C.group(St, tids);
      if (!n) return U.subjectCard({ icon: ABBR[s.code], code: s.code, title: s.name_th, sub: (s.course_codes || []).join(", ") || "เทอม 2", end: U.todo(), muted: true, test: "subj-" + s.code });
      return U.subjectCard({ icon: ABBR[s.code], code: s.code, title: s.name_th, sub: `${(s.course_codes || []).join(", ")} · ${tids.length} บท · ${n} ข้อ`, end: U.bandBadge(C.band(gm.m, gm.n)), go: "#/s/" + s.id, test: "subj-" + s.code });
    }).join("");
    const mock = S.sets.find(x => x.kind === "mock");
    render(U.topbar({ title: appTitle(), sub: `น้อง${S.prof.nick} · ${S.prof.room || g.name_th}`, actions: U.btn("เปลี่ยนชั้น", { kind: "text", sm: true, go: "#/grades", test: "change-grade" }) })
      + U.page(U.hero({ title: `สวัสดี น้อง${S.prof.nick}`, sub: `ฝึกวันนี้ ${sk.today}/${C.RULES.goal} ข้อ`, mood: sk.today >= C.RULES.goal ? "cheer" : "hello", extra: U.progLine(sk.today / C.RULES.goal * 100, `${sk.streak} วันติด`) })
        + U.h2("วิชา (บทเรียนเทอม 2)", U.badge("ข้อสอบร่าง รอครูตรวจ", "warn", "✎"))
        + U.grid(subs)
        + (mock ? U.h2("ห้องสอบ") + U.grid(setTile(mock, St) + U.setCard({ icon: "≡", title: "ประวัติการสอบและผลการฝึก", sub: "ดูคะแนนย้อนหลังทุกครั้ง", go: "#/h", test: "history" })) : "")
        + U.foot()));
  }
  function setTile(set, St) {
    const rs = C.setState(S.P, St, set), used = C.used(S.P, set.id), max = set.max_attempts || C.RULES.maxAttempts;
    const sub = `${set.n_items} ข้อ · ${set.minutes} นาที · สอบได้ ${max} ครั้ง (ใช้ไป ${used})`;
    if (!rs.open) return U.setCard({ icon: "–", title: set.name_th, sub: rs.text, end: U.badge("ยังล็อก", "", "⊘") + U.prog(rs.prog), muted: true, test: "set-" + set.id });
    if (used >= max) return U.setCard({ icon: "✓", title: set.name_th, sub: "ใช้สิทธิ์สอบครบแล้ว", end: U.badge("ครบแล้ว", "", "✓"), muted: true, test: "set-" + set.id });
    return U.setCard({ icon: "✎", title: set.name_th, sub, end: U.badge("พร้อมสอบ", "pink", "▶"), go: "#/x/" + set.id, test: "set-" + set.id });
  }

  // ---------- subject page: บท list + subject exam room ----------
  function scrSubject(sid) {
    const s = C.SUBJ[sid]; if (!s) return go("#/");
    const St = C.stats(S.P), tids = C.strandsOf(sid), gm = C.group(St, tids);
    const all = strandsOfSubj(sid);
    const list = all.map(t => {
      const n = strandCount(t.id), st = St[t.id] || { m: 0, n: 0 };
      if (!n) return U.setCard({ icon: String(t.group_no), title: `บทที่ ${t.group_no} ${t.name_th}`, sub: (t.concepts || []).join(" · "), end: U.todo(), muted: true, test: "strand-" + t.id });
      if (!C.strandOpen(St, t.id) && !S.P.unlockAll) return U.setCard({ icon: String(t.group_no), title: `บทที่ ${t.group_no} ${t.name_th}`, sub: `ฝึกบทก่อนหน้าให้ครบ ${C.RULES.unlockTopicN} ข้อเพื่อเปิด`, end: U.badge("ยังล็อก", "", "—"), muted: true, test: "strand-" + t.id });
      return U.setCard({ icon: String(t.group_no), title: `บทที่ ${t.group_no} ${t.name_th}`, sub: `ระดับ${C.LV[C.level(S.P, t.id)]} · ฝึกแล้ว ${st.n} ข้อ · ${n} ข้อในคลัง`, end: U.bandBadge(C.band(st.m, st.n)), go: "#/p/" + t.id, test: "strand-" + t.id });
    }).join("");
    const room = S.sets.find(x => x.kind === "subject_room" && x.subject_id === sid);
    const chart = U.chart(tids.map(t => ({ label: `บทที่ ${C.STR[t].group_no} ${C.STR[t].name_th}`, pct: St[t].m, n: St[t].n })));
    render(U.topbar({ title: s.name_th, sub: `${gradeOf(S.grade).name_th} · ${(s.course_codes || []).join(", ")} · เทอม 2`, back: "#/" })
      + U.page(U.split(
        U.card(U.row(`<div class="eg-grow eg-stack">${U.h2("ความแม่นวิชานี้")}${U.progLine(gm.m, gm.m + "%", gm.m >= 75 ? "ok" : gm.m >= 50 ? "warn" : "")}</div>`)
          + (tids.length ? U.btn("ฝึกบทที่ควรฝึกที่สุด", { kind: "primary", go: "#/p/" + C.weakest(St, tids), test: "practice-weakest" }) : ""))
        + U.h2("บทเรียน") + (list ? U.stack(list) : U.empty("ยังต้องเติม", "ยังไม่มีบทเรียนเทอม 2 จาก Helix", "wait")),
        (room ? U.h2("ห้องสอบวิชา") + setTile(room, St) : "")
        + U.card(U.h2("ผลรายบท") + chart)
        + (s.note ? U.note(esc(s.note), true) : "")
      ) + U.foot()));
  }

  // ---------- practice round (5 items, adaptive) ----------
  function scrPractice(tid) {
    if (!C.STR[tid]) return go("#/");
    if (!S.QS || S.QS.tid !== tid || S.QS.done) S.QS = { tid, i: 0, items: [], ans: {}, times: {}, levels: {}, sel: null, checked: false, started: new Date().toISOString(), cid: "p-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8) };
    const Q = S.QS;
    if (!Q.items[Q.i]) { const q = C.pickQ(S.P, tid); Q.items[Q.i] = q.id; Q.levels[q.id] = C.level(S.P, tid); Q.qStart = performance.now(); }
    const it = C.QID[Q.items[Q.i]], t = C.STR[tid], s = C.SUBJ[t.subject_id];
    const meta = U.badge(`ข้อ ${Q.i + 1}/${C.RULES.round}`, "pink") + U.badge(`ระดับ${C.LV[it.difficulty]}`) + U.badge("ข้อสอบร่าง", "warn", "✎");
    let after = "";
    if (Q.checked) { const ok = C.isCorrect(it, Q.sel); after = U.explain(ok, (it.explanation || []).concat(it.review_flag ? ["หมายเหตุสำหรับครู: " + it.review_flag] : []), ok ? "✓ ถูกต้อง" : `✗ ยังไม่ถูก · คำตอบที่ถูก: ${U.KEYS[it.answer_index]}`) + (Q.lvMsg ? U.note(esc(Q.lvMsg)) : ""); }
    const actBtn = Q.checked ? U.btn(Q.i + 1 >= C.RULES.round ? "ดูผลรอบนี้" : "ข้อต่อไป", { kind: "primary", act: "next", test: "next" }) : U.btn("ตรวจคำตอบ", { kind: "primary", act: "check", disabled: Q.sel == null, test: "check" });
    render(U.topbar({ title: `บทที่ ${t.group_no} ${t.name_th}`, sub: `${gradeOf(S.grade).name_th} · ${s.name_th} · ฝึก`, back: "#/s/" + s.id })
      + U.page(U.progLine((Q.i + (Q.checked ? 1 : 0)) / C.RULES.round * 100, `${Q.i + (Q.checked ? 1 : 0)}/${C.RULES.round}`)
        + U.card(U.question(it, { sel: Q.sel, reveal: Q.checked, meta, after })) + `<div class="eg-sticky-bottom">${U.btns(actBtn, true)}</div>`));
  }
  async function practiceCheck() {
    const Q = S.QS, it = C.QID[Q.items[Q.i]]; if (Q.sel == null) return;
    Q.times[it.id] = Math.round(performance.now() - Q.qStart); Q.ans[it.id] = Q.sel; Q.checked = true;
    const r = C.applyAnswer(S.P, it, C.isCorrect(it, Q.sel), Date.now(), Q.sel); C.saveP(uid(), S.grade, S.P);
    Q.lvMsg = r.change > 0 ? `เก่งมาก! ขึ้นระดับ${C.LV[r.to]}` : r.change < 0 ? `ลองระดับ${C.LV[r.to]}ก่อนนะ` : "";
    scrPractice(Q.tid);
  }
  async function practiceNext() {
    const Q = S.QS;
    if (Q.i + 1 < C.RULES.round) { Q.i++; Q.sel = null; Q.checked = false; Q.lvMsg = ""; return scrPractice(Q.tid); }
    Q.done = true; const res = C.gradeSet(Q.items, Q.ans); const t = C.STR[Q.tid];
    const rec = { cid: Q.cid, kind: "practice", ts: Date.now(), title: `ฝึกบทที่ ${t.group_no} ${t.name_th}`, subject_id: t.subject_id, strand_id: Q.tid, qids: Q.items, ans: Q.ans, times: Q.times, res, back: "#/s/" + t.subject_id };
    S.P.rounds = (S.P.rounds || 0) + 1; await saveAttempt(rec, { kind: "practice", subject_id: t.subject_id, strand_id: Q.tid, started_at: Q.started });
  }
  async function saveAttempt(rec, base) {
    S.P.results = S.P.results || {}; S.P.results[rec.cid] = Object.assign({}, rec, { saved: false });
    const keep = Object.keys(S.P.results).slice(-30); S.P.results = Object.fromEntries(keep.map(k => [k, S.P.results[k]]));
    C.saveP(uid(), S.grade, S.P);
    try {
      const a = await D.record(Object.assign({ client_attempt_id: rec.cid, grade_code: S.grade, submitted_at: new Date().toISOString(), meta: { app: "examgym-web", title: rec.title } }, base, {
        answers: rec.qids.map((id, pos) => ({ item_id: id, position: pos, choice_index: rec.ans[id] == null ? null : rec.ans[id], time_ms: rec.times[id] || null, level_at: (S.QS && S.QS.levels && S.QS.levels[id]) != null && rec.kind === "practice" ? S.QS.levels[id] : null }))
      }));
      S.P.results[rec.cid].saved = true; S.P.results[rec.cid].server = { id: a.id, n: a.n_items, correct: a.n_correct, pct: a.score_pct, passed: a.passed }; C.saveP(uid(), S.grade, S.P);
    } catch (e) { fail(e); }
    go("#/r/" + rec.cid);
  }

  // ---------- exam (subject room / mock) ----------
  function scrExam(setId) {
    const set = S.sets.find(x => x.id === setId); if (!set) return go("#/");
    const St = C.stats(S.P), rs = C.setState(S.P, St, set);
    if (!S.X || S.X.set !== setId || S.X.done) {
      if (!rs.open) return go(set.subject_id ? "#/s/" + set.subject_id : "#/");
      const cid = "x-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      S.X = { set: setId, cid, qids: C.buildTest(set, cid + uid()), ans: {}, flag: {}, times: {}, i: 0, t0: Date.now(), started: new Date().toISOString(), qStart: performance.now() };
    }
    const X = S.X, it = C.QID[X.qids[X.i]], left = () => set.minutes * 60 - (Date.now() - X.t0) / 1000;
    const nav = `<div class="eg-qnav">${X.qids.map((id, k) => `<button data-act="goto" data-arg="${k}" class="${k === X.i ? "is-cur" : X.ans[id] != null ? "is-done" : ""}${X.flag[id] ? " is-flag" : ""}" aria-label="ข้อ ${k + 1}">${k + 1}</button>`).join("")}</div>`;
    const done = X.qids.filter(id => X.ans[id] != null).length;
    const subj = C.SUBJ[it.subject_id];
    const meta = U.badge(`ข้อ ${X.i + 1}/${X.qids.length}`, "pink") + (set.kind === "mock" ? U.badge(subj.name_th) : "") + (X.flag[it.id] ? U.badge("ทบทวน", "warn", "△") : "");
    render(U.topbar({ title: set.name_th, sub: `${gradeOf(S.grade).name_th}${set.subject_id ? " · " + C.SUBJ[set.subject_id].name_th : ""}`, back: set.subject_id ? "#/s/" + set.subject_id : "#/", actions: `<span class="eg-badge eg-badge--pink eg-timer" id="timer">⏱ ${C.fmtT(left())}</span>` })
      + U.page(U.split(
        U.card(U.question(it, { sel: X.ans[it.id], meta }))
        + U.btns(U.btn("‹ ก่อนหน้า", { act: "prev", disabled: X.i === 0 }) + U.btn(X.flag[it.id] ? "เลิกทำเครื่องหมาย" : "△ ทำเครื่องหมายทบทวน", { act: "flag" }) + U.btn("ถัดไป ›", { act: "nextq", disabled: X.i + 1 >= X.qids.length, test: "nextq" })),
        U.card(U.h2("ข้อสอบทั้งหมด") + U.progLine(done / X.qids.length * 100, `ตอบแล้ว ${done}/${X.qids.length}`) + nav
          + U.btn("ส่งข้อสอบ", { kind: "primary", act: "submit", test: "submit" }))
      )));
    S.tick = setInterval(() => { const el = document.getElementById("timer"); if (!el) return; const l = left(); el.textContent = "⏱ " + C.fmtT(l); if (l <= 0) submitExam(true); }, 1000);
  }
  function examTime() { const X = S.X, id = X.qids[X.i]; X.times[id] = (X.times[id] || 0) + Math.round(performance.now() - X.qStart); X.qStart = performance.now(); }
  async function submitExam(auto) {
    const X = S.X; if (!X || X.done) return;
    if (!auto) { const left = X.qids.filter(id => X.ans[id] == null).length; if (left && !confirm(`ยังไม่ได้ตอบ ${left} ข้อ ส่งข้อสอบเลยไหม?`)) return; }
    examTime(); X.done = true; clearInterval(S.tick);
    const set = S.sets.find(x => x.id === X.set), res = C.gradeSet(X.qids, X.ans);
    const rec = { cid: X.cid, kind: set.kind, set: set.id, ts: Date.now(), title: set.name_th, subject_id: set.subject_id, qids: X.qids, ans: X.ans, times: X.times, res, auto: !!auto, back: set.subject_id ? "#/s/" + set.subject_id : "#/" };
    (S.P.tests[set.id] = S.P.tests[set.id] || []).push({ ts: rec.ts, pct: res.pct, pass: res.pass, cid: rec.cid });
    await saveAttempt(rec, { kind: set.kind, exam_set_id: set.id, subject_id: set.subject_id, started_at: X.started, duration_s: Math.round((Date.now() - X.t0) / 1000), auto_submitted: !!auto, attempt_no: S.P.tests[set.id].length });
  }

  // ---------- result ----------
  function scrResult(cid) {
    const rec = S.P.results && S.P.results[cid]; if (!rec) return go("#/h");
    const r = rec.res, sv = rec.server;
    const per = Object.entries(r.per).map(([t, v]) => ({ label: `บทที่ ${C.STR[t].group_no} ${C.STR[t].name_th}`, pct: Math.round(v[0] / v[1] * 100), n: v[1] }));
    const secs = Object.values(rec.times).reduce((a, b) => a + b, 0) / 1000;
    const review = rec.qids.map((id, k) => { const it = C.QID[id], a = rec.ans[id], ok = C.isCorrect(it, a);
      return U.card(U.question(it, { sel: a == null ? null : +a, reveal: true, meta: U.badge(`ข้อ ${k + 1}`, "pink") + (a == null ? U.badge("ไม่ได้ตอบ", "warn", "△") : ok ? U.badge("ถูก", "ok", "✓") : U.badge("ผิด", "no", "✗")),
        after: U.explain(a == null ? null : ok, it.explanation || [], ok ? "✓ ถูกต้อง" : `คำตอบที่ถูก: ${U.KEYS[it.answer_index]}`) })); }).join("");
    render(U.topbar({ title: "ผลการทำ", sub: `${gradeOf(S.grade).name_th} · ${rec.title}`, back: rec.back || "#/" })
      + U.page(U.split(
        U.card(U.score({ pct: r.pct, correct: r.correct, n: r.n, pass: r.pass, sub: rec.title }) + U.stats([[`${r.correct}/${r.n}`, "ข้อที่ถูก"], [C.fmtT(secs), "เวลาที่ใช้"], [rec.kind === "practice" ? "ฝึก" : "สอบ", "ประเภท"]])
          + (rec.saved ? U.badge(`บันทึกผลแล้ว · คะแนนจากเซิร์ฟเวอร์ ${sv.correct}/${sv.n}`, "ok", "✓") : U.badge("ยังไม่ได้บันทึกขึ้นเซิร์ฟเวอร์", "warn", "△")), "", { "data-test": "result" })
        + U.btns(U.btn(rec.kind === "practice" ? "ฝึกต่ออีกรอบ" : "กลับหน้าวิชา", { kind: "primary", go: rec.kind === "practice" ? "#/p/" + rec.strand_id : rec.back, test: "again" }) + U.btn("หน้าหลัก", { kind: "ghost", go: "#/" })),
        U.card(U.h2("ผลรายบท") + U.chart(per))
      ) + U.h2("เฉลยทีละข้อ") + review));
  }

  // ---------- history (from Supabase) ----------
  async function scrHistory() {
    const rows = await D.attempts(S.grade, 50);
    const name = a => a.exam_set_id ? (S.sets.find(x => x.id === a.exam_set_id) || {}).name_th : a.strand_id && C.STR[a.strand_id] ? `ฝึก · ${C.STR[a.strand_id].name_th}` : a.kind;
    render(U.topbar({ title: "ประวัติ", sub: `${gradeOf(S.grade).name_th} · น้อง${S.prof.nick}`, back: "#/" })
      + U.page(U.card(U.h2("ผลที่บันทึกในระบบ") + U.table([
        { t: "เวลา", html: a => esc(C.fmtDate(a.submitted_at)) }, { t: "รายการ", html: a => esc(name(a) || "") }, { t: "วิชา", html: a => esc(a.subject_id ? (C.SUBJ[a.subject_id] || {}).name_th : "ทุกวิชา") },
        { t: "คะแนน", num: true, html: a => `${a.n_correct}/${a.n_items}` }, { t: "ผล", html: a => a.kind === "practice" ? U.badge(a.score_pct + "%", a.score_pct >= 70 ? "ok" : "warn", a.score_pct >= 70 ? "✓" : "△") : U.badge(a.passed ? "ผ่าน" : "ไม่ผ่าน", a.passed ? "ok" : "no", a.passed ? "✓" : "✗") }
      ], rows)) + U.foot()));
  }

  // ---------- ม.6: transitional page (bank imported AS-IS; students keep using the live ม.6 app) ----------
  function scrM6() {
    const m6 = subjectsOf("M6");
    const tiles = m6.map(s => { const n = subjCount(s.id); return n ? U.subjectCard({ icon: ABBR[s.code], code: s.code, title: s.name_th, sub: `${(s.course_codes || []).join(", ")} · ${n} ข้อ (นำเข้าจากระบบ ม.6 เดิม)`, end: U.badge("นำเข้าแล้ว", "ok", "✓"), href: D.M6_URL, test: "m6-" + s.code })
      : U.subjectCard({ icon: ABBR[s.code] || "?", code: s.code, title: s.name_th, sub: s.note || "บทเรียนเทอม 2", end: U.todo(), muted: true }); }).join("");
    render(U.topbar({ title: "Exam Gym ม.6", sub: "ช่วงเปลี่ยนผ่าน · ใช้ระบบเดิม", back: "#/" })
      + U.page(U.hero({ title: "ม.6 ใช้ระบบเดิมไปก่อน", sub: "ข้อสอบ ม.6 ทั้งหมดถูกนำเข้าระบบใหม่แบบไม่แก้ไข เมื่อย้ายบัญชีนักเรียนเสร็จ ม.6 จะฝึกในระบบนี้ได้", mood: "reading",
        extra: U.btns(U.btn("เข้าสู่ระบบ Exam Gym ม.6 ↗", { kind: "light", href: D.M6_URL, test: "m6-go" })) })
        + U.h2("คลังข้อสอบ ม.6 (นำเข้าแล้ว)") + U.grid(tiles) + U.foot()));
  }

  // ---------- teacher dashboard (same design system) ----------
  function teacherLoginForm(err, email) {
    err = err || {};
    return U.card(`<form id="tlogin" class="eg-stack eg-login" novalidate>${U.h2("เข้าสู่ระบบครู / ผู้บริหาร")}`
      + U.field({ id: "t_email", label: "อีเมลของโรงเรียน", type: "email", auto: "username", value: email, err: err.email, ph: "name@piyamit.ac.th" })
      + U.field({ id: "t_pw", label: "รหัสผ่าน", type: "password", auto: "current-password", err: err.pw, reveal: true, help: "บัญชีครูสร้างโดยผู้ดูแลระบบเท่านั้น นักเรียนไม่ต้องใช้หน้านี้" })
      + U.btn("เข้าสู่ระบบ", { kind: "primary", type: "submit", test: "tlogin" }) + `</form>`);
  }
  async function scrTeacher(gsel, err, email) {
    if (!S.prof || !isTeacher()) {
      render(U.topbar({ title: "สำหรับครู", sub: "Exam Gym ปิยมิตรมัธยม", back: "#/" }) + U.page(U.split(
        teacherLoginForm(err, email),
        U.hero({ title: "แดชบอร์ดครู", sub: "ดูความก้าวหน้ารายห้อง รายบท รายคน และตรวจข้อสอบร่าง", mood: "grammar" })
        + U.card(U.h2("ผู้บริหาร") + U.p("รายงานภาพรวมทุกชั้น (ค่าเฉลี่ย มัธยฐาน ผ่าน/ไม่ผ่าน การใช้งาน) อยู่ที่หน้ารายงานผู้บริหาร")
          + U.btns(U.btn("ไปหน้ารายงานผู้บริหาร ›", { kind: "ghost", href: BASE + "dashboard/", test: "to-dashboard" }))))));
      document.getElementById("tlogin").addEventListener("submit", async e => { e.preventDefault();
        const em = document.getElementById("t_email").value.trim(), pw = document.getElementById("t_pw").value;
        const E = {}; if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) E.email = "กรุณากรอกอีเมลให้ถูกต้อง"; if (!pw) E.pw = "กรุณากรอกรหัสผ่าน";
        if (Object.keys(E).length) return scrTeacher(gsel, E, em);
        const btn = e.target.querySelector("[data-test=tlogin]"); btn.disabled = true; btn.textContent = "กำลังเข้าสู่ระบบ…";
        try { S.prof = await D.teacherLogin(em, pw); S.user = await D.user(); if (!isTeacher()) { await D.signOut(); S.prof = null; S.user = null; return scrTeacher(gsel, { pw: "บัญชีนี้ไม่ใช่บัญชีครู" }, em); } scrTeacher(); }
        catch (x) { console.warn(x); scrTeacher(gsel, { pw: /invalid/i.test(x.message || "") ? "อีเมลหรือรหัสผ่านไม่ถูกต้อง" : "เข้าสู่ระบบไม่สำเร็จ: " + (x.message || x) }, em); } });
      return;
    }
    const grades = (await D.teacherGrades(S.cat.grades)).filter(x => gradeOf(x)); const g = gsel && grades.includes(gsel) ? gsel : grades[0];
    if (!g) { render(U.topbar({ title: "แดชบอร์ดครู", sub: S.prof.full_name, actions: U.btn("ออก", { kind: "text", act: "signout" }) }) + U.page(U.empty("ยังไม่มีชั้นที่ดูแล", "ให้ผู้ดูแลระบบกำหนดชั้นหรือฝ่ายที่ดูแล", "wait", U.btns(U.btn("ไปหน้ารายงานผู้บริหาร ›", { kind: "ghost", href: BASE + "dashboard/" }))))); return; }
    const [prog, rooms, strands, items] = await Promise.all([D.view("v_student_progress", g), D.view("v_room_summary", g), D.view("v_strand_summary", g), D.view("v_item_stats", g)]);
    const active = rooms.reduce((a, r) => a + Number(r.n_active_7d || 0), 0), studs = prog.length;
    const ans = strands.reduce((a, r) => a + Number(r.n_answers), 0), cor = strands.reduce((a, r) => a + Number(r.n_correct), 0);
    const byStrand = {}; strands.forEach(r => { const k = r.strand_id; const b = byStrand[k] = byStrand[k] || { label: `${r.subject_name} · ${r.strand_name}`, a: 0, c: 0 }; b.a += Number(r.n_answers); b.c += Number(r.n_correct); });
    const flagged = items.filter(i => i.review_flag || (i.n_answers >= 5 && (i.pct_correct < 30 || i.pct_correct > 95)));
    render(U.topbar({ title: "แดชบอร์ดครู", sub: `${esc(S.prof.full_name)} · ${gradeOf(g).name_th}`, actions: U.btn("ออก", { kind: "text", act: "signout" }) })
      + U.page(U.seg(grades.map(x => [x, gradeOf(x).name_th]), g, "tgrade")
        + U.card(U.stats([[studs, "นักเรียน"], [active, "ใช้งาน 7 วัน"], [ans ? Math.round(cor / ans * 100) + "%" : "—", "ตอบถูกเฉลี่ย"]]), "hero")
        + U.split(U.card(U.h2("รายห้อง") + U.table([{ k: "school", t: "โรงเรียน" }, { k: "room", t: "ห้อง" }, { k: "n_students", t: "คน", num: true }, { k: "n_active_7d", t: "ใช้งาน 7 วัน", num: true }, { t: "ถูก (ฝึก)", num: true, html: r => r.practice_pct == null ? "—" : r.practice_pct + "%" }], rooms)),
          U.card(U.h2("รายบท") + U.chart(Object.values(byStrand).map(b => ({ label: b.label, pct: Math.round(b.c / b.a * 100), n: b.a }))))
        )
        + U.card(U.h2("รายคน") + U.table([{ k: "full_name", t: "ชื่อ" }, { k: "room", t: "ห้อง" }, { k: "practice_items", t: "ฝึก (ข้อ)", num: true }, { t: "ถูก", num: true, html: r => r.practice_pct == null ? "—" : r.practice_pct + "%" }, { t: "ห้องสอบสูงสุด", num: true, html: r => r.best_subject_room_pct == null ? "—" : r.best_subject_room_pct + "%" }, { t: "ล่าสุด", html: r => r.last_active ? esc(C.fmtDate(r.last_active)) : "—" }], prog))
        + U.card(U.h2("ข้อสอบร่างที่ควรตรวจ", U.badge(`${flagged.length} ข้อ`, "warn", "✎")) + U.table([{ k: "item_id", t: "รหัสข้อ" }, { k: "subject_id", t: "วิชา" }, { k: "n_answers", t: "ตอบ", num: true }, { t: "ถูก", num: true, html: r => r.pct_correct == null ? "—" : r.pct_correct + "%" }, { t: "หมายเหตุ", html: r => r.review_flag ? U.badge(r.review_flag.slice(0, 40), "warn", "△") : "" }], flagged.slice(0, 40)))
        + U.foot()));
  }

  // ---------- events ----------
  // any form: editing a field clears its error state (shared behaviour, no per-page code)
  const clearErr = e => { const f = e.target.closest && e.target.closest(".eg-field--err"); if (f) { f.classList.remove("eg-field--err"); const m = f.querySelector(".eg-field__err"); if (m) m.textContent = ""; } };
  document.addEventListener("input", clearErr); document.addEventListener("change", clearErr);
  document.addEventListener("click", async e => {
    const rv = e.target.closest("[data-reveal]");
    if (rv) { const i = document.getElementById(rv.dataset.reveal); const show = i.type === "password"; i.type = show ? "text" : "password"; rv.textContent = show ? "ซ่อน" : "แสดง"; rv.setAttribute("aria-label", show ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"); return; }
    const el = e.target.closest("[data-go],[data-act]"); if (!el || el.disabled) return;
    if (el.dataset.go) { e.preventDefault(); if (S.X && !S.X.done && location.hash.startsWith("#/x/") && !confirm("ออกจากห้องสอบ? เวลายังเดินต่อ")) return; return go(el.dataset.go); }
    const a = el.dataset.act, arg = el.dataset.arg;
    try {
      if (a === "reload") return location.reload();
      if (a === "signout") { await D.signOut(); S.prof = null; S.user = null; S.items = null; S.grade = null; return go("#/"); }
      if (a === "pick") { S.pick = arg; return scrPicker(); }
      if (a === "confirm-grade") { const room = document.getElementById("p_room").value; S.prof = await D.setGrade(arg, room); S.pick = null; S.items = null; U.toast(`เลือก ${room} แล้ว`); return go("#/"); }
      if (a === "choose") { if (location.hash.startsWith("#/p/")) { if (!S.QS.checked) { S.QS.sel = +arg; scrPractice(S.QS.tid); } } else if (S.X) { S.X.ans[S.X.qids[S.X.i]] = +arg; examTime(); scrExam(S.X.set); } return; }
      if (a === "check") return practiceCheck();
      if (a === "next") return practiceNext();
      if (a === "prev" || a === "nextq" || a === "goto") { examTime(); S.X.i = a === "goto" ? +arg : S.X.i + (a === "prev" ? -1 : 1); return scrExam(S.X.set); }
      if (a === "flag") { const id = S.X.qids[S.X.i]; S.X.flag[id] = !S.X.flag[id]; return scrExam(S.X.set); }
      if (a === "submit") return submitExam(false);
      if (a === "tgrade") return scrTeacher(arg);
    } catch (x) { fail(x); }
  });

  // test hook (local e2e only; harmless in production: affects only this device's practice state)
  window.__EG = { S, C, unlockAll() { if (S.P) { S.P.unlockAll = true; C.saveP(uid(), S.grade, S.P); } }, route };
  boot().catch(e => { fail(e); render(U.page(U.empty("เชื่อมต่อระบบไม่สำเร็จ", String(e.message || e), "wait"))); });
})();
