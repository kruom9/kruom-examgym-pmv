/* Exam Gym ปิยมิตรวิทยา · portal: choose มัธยม or ประถม (static; no data calls) */
(function () {
  const U = window.EGUI, CFG = window.EXAMGYM_CONFIG || {};
  const P6 = (CFG.PRATHOM && CFG.PRATHOM.P6_URL) || "https://kruom9.github.io/kruom-xexamgym-p6/";
  document.getElementById("app").innerHTML =
    U.topbar({ title: "Exam Gym ปิยมิตรวิทยา", sub: "เลือกฝ่ายของนักเรียน", actions: U.btn("ครู / ผู้บริหาร", { kind: "text", sm: true, href: "dashboard/", test: "portal-staff" }) })
    + U.page(
      U.hero({ title: "เลือกฝ่ายก่อนเริ่มฝึก", sub: "ใช้ระบบเดียวกันทั้งสองฝ่าย ฝึกข้อสอบตามบทเรียน ตรวจให้ทันที ใช้ฟรี", mood: "hello" })
      + U.grid(
        U.sectionCard({ title: "ฝ่ายมัธยม", sub: "Exam Gym ปิยมิตรมัธยม", lines: ["ม.1–ม.5 ฝึกในระบบนี้", "ม.6 ใช้ระบบ ม.6 เดิมไปก่อน (มีลิงก์ในหน้า)"], href: "mattayom/", cta: "เข้าฝ่ายมัธยม", art: "mascot-reading.svg", test: "sect-mattayom" })
        + U.sectionCard({ title: "ฝ่ายประถม", sub: "Exam Gym ปิยมิตรประถม", lines: ["ป.6 ใช้ระบบ ป.6 ที่เปิดอยู่", "ป.4 และ ป.5 เร็ว ๆ นี้"], href: "prathom/", cta: "เข้าฝ่ายประถม", art: "mascot-cheer.svg", test: "sect-prathom" }), 2)
      + U.note(`นักเรียน ป.6 ไปที่ <a href="${U.esc(P6)}" data-test="portal-p6">Exam Gym ป.6 ↗</a> ได้โดยตรง`)
      + `<footer class="eg-foot"><img src="assets/art/icon-64.png" alt="">โรงเรียนปิยมิตรวิทยา · อ.เชียงคำ จ.พะเยา</footer>`);
})();
