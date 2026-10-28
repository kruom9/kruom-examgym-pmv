/* Exam Gym ปิยมิตรประถม · ประถม block (ป.4, ป.5, ป.6).
   NOT WIRED to a database yet: the ประถม project is kruom-examgym-p6 (owner: Peter) and is reviewed/connected by its owner.
   ป.6 links to the live ป.6 app; ป.4 / ป.5 are "coming soon" until the director decides the content source. */
(function () {
  const U = window.EGUI, CFG = window.EXAMGYM_CONFIG || {}, PR = CFG.PRATHOM || {};
  const P6 = PR.P6_URL || "https://kruom9.github.io/kruom-xexamgym-p6/";
  const SUBJ = [["MA", "คณ", "คณิตศาสตร์"], ["SC", "วท", "วิทยาศาสตร์"], ["EN", "En", "ภาษาอังกฤษ"], ["TH", "ทย", "ภาษาไทย"], ["SO", "สค", "สังคมศึกษา"]];
  const tile = (code, name, live) => live
    ? U.gradeCard({ icon: name.slice(-1), title: `Exam Gym ${name}`, sub: "ระบบ ป.6 ที่เปิดใช้อยู่ · 5 วิชา", end: U.badge("เปิดแล้ว ↗", "pink"), href: P6, test: "grade-" + code })
    : U.gradeCard({ icon: name.slice(-1), title: `Exam Gym ${name}`, sub: "5 วิชา · กำลังเตรียมข้อสอบ", end: U.soon(), muted: true, test: "grade-" + code });
  const route = () => {
    const soon = location.hash.replace(/^#\/?/, "");
    let html = U.topbar({ title: "Exam Gym ปิยมิตรประถม", sub: "โรงเรียนปิยมิตรวิทยา ฝ่ายประถม", actions: U.btn("เลือกฝ่าย", { kind: "text", sm: true, href: "../", test: "to-portal" }) });
    if (soon === "P4" || soon === "P5") {
      const n = soon === "P4" ? "ป.4" : "ป.5";
      html = U.topbar({ title: `Exam Gym ${n}`, sub: "เร็ว ๆ นี้", back: "#/" }) + U.page(U.hero({ title: `${n} กำลังเตรียมข้อสอบ`, sub: "เมื่อครูเตรียมบทเรียนและข้อสอบเสร็จ หน้านี้จะเปิดให้ฝึก", mood: "wait" })
        + U.h2("วิชาที่จะเปิด") + U.grid(SUBJ.map(([c, a, t]) => U.subjectCard({ icon: a, code: c, title: t, sub: "ยังไม่มีเนื้อหา", end: U.soon(), muted: true })).join("")) + U.foot());
    } else {
      html += U.page(U.hero({ title: "Exam Gym ปิยมิตรประถม", sub: "ฝึกข้อสอบ ป.4–ป.6 · ป.6 เปิดใช้แล้ว", mood: "cheer",
          extra: U.btns(U.btn("ไป Exam Gym ป.6 ↗", { kind: "light", href: P6, test: "p6-go" })) })
        + U.h2("ชั้นในฝ่ายประถม") + U.grid(tile("P4", "ป.4") + tile("P5", "ป.5") + tile("P6", "ป.6", true), 3)
        + U.btns(U.btn("ดู ป.4", { kind: "text", sm: true, go: "#/P4" }) + U.btn("ดู ป.5", { kind: "text", sm: true, go: "#/P5" }))
        + U.foot());
    }
    document.getElementById("app").innerHTML = html;
  };
  document.addEventListener("click", e => { const el = e.target.closest("[data-go]"); if (el) { e.preventDefault(); location.hash = el.dataset.go; } });
  window.addEventListener("hashchange", route); route();
})();
