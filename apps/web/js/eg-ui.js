/* Exam Gym · UI components (the only place that emits markup classes; pages compose these) */
(function () {
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const attrs = o => Object.entries(o || {}).filter(([, v]) => v != null && v !== false).map(([k, v]) => v === true ? ` ${k}` : ` ${k}="${esc(v)}"`).join("");
  const BASE = window.EG_BASE || "", ART = BASE + "assets/art/";
  const SECTION_TXT = { mattayom: "ฝ่ายมัธยม", prathom: "ฝ่ายประถม" };
  const KEYS = ["ก", "ข", "ค", "ง", "จ"];
  const UI = {
    esc, attrs, KEYS, BASE,
    topbar({ title, sub, back, actions }) {
      return `<header class="eg-top"><div class="eg-top__in">${back ? `<button class="eg-top__back" data-go="${esc(back)}" aria-label="ย้อนกลับ">‹</button>` : ""}`
        + `<img class="eg-top__logo" src="${ART}piyamit-logo-256.png" alt="โรงเรียนปิยมิตรวิทยา">`
        + `<div class="eg-top__title"><b>${esc(title)}</b>${sub ? `<span>${esc(sub)}</span>` : ""}</div>`
        + `<div class="eg-top__act">${actions || ""}</div></div></header>`;
    },
    page: (inner, extra) => `<main class="eg-page${extra ? " " + extra : ""}">${inner}</main>`,
    card: (inner, mod, a) => `<section class="eg-card${mod ? " eg-card--" + mod : ""}"${attrs(a)}>${inner}</section>`,
    stack: inner => `<div class="eg-stack">${inner}</div>`,
    row: inner => `<div class="eg-row">${inner}</div>`,
    grid: (inner, n) => `<div class="eg-grid${n ? " eg-grid--" + n : ""}">${inner}</div>`,
    split: (a, b) => `<div class="eg-split"><div class="eg-stack">${a}</div><div class="eg-stack">${b}</div></div>`,
    h1: t => `<h1 class="eg-h1">${esc(t)}</h1>`,
    h2: (t, right) => `<div class="eg-section-title"><h2 class="eg-h2">${esc(t)}</h2>${right || ""}</div>`,
    p: (t, mod) => `<p class="${mod || "eg-mut"}">${esc(t)}</p>`,
    note: (html, warn) => `<div class="eg-note${warn ? " eg-note--warn" : ""}">${html}</div>`,
    mascot: (mood, cls) => `<img class="${cls || "eg-hero__art"}" src="${ART}mascot-${mood || "hello"}.svg" alt="">`,
    hero({ title, sub, mood, extra }) {
      return UI.card(`<div class="eg-hero">${UI.mascot(mood)}<div class="eg-hero__txt"><h1 class="eg-h1">${esc(title)}</h1>${sub ? `<p class="eg-mut">${esc(sub)}</p>` : ""}${extra || ""}</div></div>`, "hero");
    },
    // buttons
    btn(label, o) {
      o = o || {}; const cls = "eg-btn" + (o.kind ? " eg-btn--" + o.kind : "") + (o.sm ? " eg-btn--sm" : "");
      if (o.href) return `<a class="${cls}"${attrs({ href: o.href, target: o.target, rel: o.target ? "noopener" : null, "data-test": o.test })}>${esc(label)}</a>`;
      return `<button class="${cls}"${attrs({ type: o.type || "button", "data-go": o.go, "data-act": o.act, "data-arg": o.arg, disabled: !!o.disabled, id: o.id, "data-test": o.test })}>${esc(label)}</button>`;
    },
    btns: (inner, end) => `<div class="eg-btns${end ? " eg-btns--end" : ""}">${inner}</div>`,
    badge(text, kind, icon) { return `<span class="eg-badge${kind ? " eg-badge--" + kind : ""}">${icon ? esc(icon) + " " : ""}${esc(text)}</span>`; },
    // status helpers (icon + text, never colour only)
    bandBadge(b) { return UI.badge(b.t, ["", "no", "warn", "ok"][b.k], ["○", "✗", "△", "✓"][b.k]); },
    soon: () => UI.badge("เร็ว ๆ นี้", "", "⏳"),
    todo: () => UI.badge("ยังต้องเติม", "warn", "✎"),
    // tile = grade card / subject card / exam-set card
    tile({ icon, title, sub, end, go, act, arg, href, muted, sel, kind, code, test, target }) {
      const cls = "eg-tile" + (kind ? " eg-tile--" + kind : "") + (muted ? " eg-tile--muted" : "") + (sel ? " eg-tile--sel" : "");
      const inner = `<span class="eg-tile__icon"${attrs({ "data-c": code })}>${esc(icon)}</span><span class="eg-tile__body"><span class="eg-tile__title">${esc(title)}</span>${sub ? `<span class="eg-tile__sub">${esc(sub)}</span>` : ""}</span><span class="eg-tile__end">${end || ""}${muted ? "" : `<span class="eg-tile__chev" aria-hidden="true">›</span>`}</span>`;
      if (href) return `<a class="${cls}"${attrs({ href, target, rel: target ? "noopener" : null, "data-test": test })}>${inner}</a>`;
      if (muted) return `<div class="${cls}"${attrs({ "data-test": test, "aria-disabled": "true" })}>${inner}</div>`;
      return `<button class="${cls}"${attrs({ type: "button", "data-go": go, "data-act": act, "data-arg": arg, "data-test": test })}>${inner}</button>`;
    },
    gradeCard: o => UI.tile(Object.assign({ kind: "grade" }, o)),
    subjectCard: o => UI.tile(Object.assign({ kind: "subject" }, o)),
    setCard: o => UI.tile(Object.assign({ kind: "set" }, o)),
    // progress bar (width applied after render from data-p — no inline styles)
    prog(p, kind) { return `<div class="eg-prog${kind ? " eg-prog--" + kind : ""}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(p)}"><i data-p="${Math.max(0, Math.min(100, p))}"></i></div>`; },
    progLine: (p, label, kind) => `<div class="eg-progline">${UI.prog(p, kind)}<span>${esc(label)}</span></div>`,
    stats: arr => `<div class="eg-stats">${arr.map(([v, l]) => `<div class="eg-stat"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join("")}</div>`,
    score({ pct, correct, n, pass, title, sub }) {
      return `<div class="eg-score ${pass ? "eg-score--ok" : "eg-score--no"}"><div class="eg-score__ring" data-ring="${pct}"><b>${pct}%</b></div><div class="eg-score__txt"><b class="eg-h1">${esc(title || `${correct}/${n} ข้อ`)}</b>${UI.badge(pass ? "ผ่านเกณฑ์" : "ยังไม่ผ่านเกณฑ์", pass ? "ok" : "no", pass ? "✓" : "✗")}${sub ? `<span class="eg-sm eg-mut">${esc(sub)}</span>` : ""}</div></div>`;
    },
    chart(rows) { // rows: [{label, pct, n}]
      if (!rows.length) return UI.empty("ยังไม่มีข้อมูล", "ทำแบบฝึกก่อน แล้วผลรายบทจะขึ้นที่นี่", "wait");
      return `<div class="eg-chart">${rows.map(r => `<div class="eg-chart__row"><span class="eg-chart__lbl" title="${esc(r.label)}">${esc(r.label)}</span><span class="eg-chart__val">${r.n ? r.pct + "%" : "—"} ${r.n ? (r.pct >= 75 ? "✓" : r.pct >= 50 ? "△" : "✗") : ""}</span>${UI.prog(r.pct, r.n ? (r.pct >= 75 ? "ok" : r.pct >= 50 ? "warn" : "no") : "")}</div>`).join("")}</div>`;
    },
    table(cols, rows) { // cols: [{k,t,num}]
      if (!rows.length) return UI.empty("ยังไม่มีข้อมูล", "เมื่อนักเรียนเริ่มฝึก ตารางนี้จะแสดงผล", "wait");
      return `<div class="eg-table-wrap"><table class="eg-table"><thead><tr>${cols.map(c => `<th${c.num ? ' class="eg-num"' : ""}>${esc(c.t)}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${cols.map(c => `<td${c.num ? ' class="eg-num"' : ""}>${c.html ? c.html(r) : esc(r[c.k] == null ? "—" : r[c.k])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    },
    empty(title, sub, mood, extra) { return `<div class="eg-empty">${UI.mascot(mood || "wait", "eg-empty__art")}<b>${esc(title)}</b>${sub ? `<span class="eg-sm">${esc(sub)}</span>` : ""}${extra || ""}</div>`; },
    seg(items, cur, act) { return `<div class="eg-seg" role="tablist">${items.map(([k, t]) => `<button role="tab" class="${k === cur ? "is-on" : ""}" data-act="${esc(act)}" data-arg="${esc(k)}">${esc(t)}</button>`).join("")}</div>`; },
    field({ id, label, type, ph, value, err, max, options, auto, help, reveal }) {
      const ctl = options
        ? `<select id="${esc(id)}" name="${esc(id)}">${options}</select>`
        : `<input id="${esc(id)}" name="${esc(id)}"${attrs({ type: type || "text", placeholder: ph, value: value || "", maxlength: max, autocomplete: auto || "off" })}>`;
      const eye = reveal ? `<button type="button" class="eg-btn eg-btn--text eg-btn--sm eg-field__eye" data-reveal="${esc(id)}" aria-label="แสดงรหัสผ่าน">แสดง</button>` : "";
      return `<div class="eg-field${err ? " eg-field--err" : ""}"><label for="${esc(id)}">${esc(label)}</label>${eye ? `<div class="eg-field__ctl">${ctl}${eye}</div>` : ctl}${help ? `<div class="eg-field__help">${esc(help)}</div>` : ""}<div class="eg-field__err" role="alert">${esc(err || "")}</div></div>`;
    },
    check: (id, html, checked) => `<label class="eg-check"><input type="checkbox" id="${esc(id)}"${checked ? " checked" : ""}><span>${html}</span></label>`,
    // question + choices. state: {sel, reveal, order:[orig idx...], keys:[...]}
    question(it, o) {
      o = o || {}; const order = o.order || it.choices.map((_, i) => i);
      const img = it.media && it.media.img_url ? `<img class="eg-q__img" src="${esc(it.media.img_url)}" alt="รูปประกอบโจทย์">` : "";
      const ch = order.map((orig, pos) => {
        let cls = "eg-choice", mark = "";
        const isKey = (it.answer_keys || [it.answer_index]).includes(orig);
        if (o.reveal) { if (isKey) { cls += " eg-choice--ok"; mark = "✓ ถูก"; } else if (o.sel === orig) { cls += " eg-choice--no"; mark = "✗ ที่เลือก"; } }
        else if (o.sel === orig) cls += " eg-choice--sel";
        return `<button class="${cls}" data-act="choose" data-arg="${orig}"${o.reveal ? " disabled" : ""}><span class="eg-choice__key">${KEYS[pos]}</span><span class="eg-choice__txt">${esc(it.choices[orig])}</span>${mark ? `<span class="eg-choice__mark">${mark}</span>` : ""}</button>`;
      }).join("");
      return `<div class="eg-q" data-qid="${esc(it.id)}"><div class="eg-q__meta">${o.meta || ""}</div><div class="eg-q__stem">${esc(it.stem)}</div>${img}<div class="eg-choices">${ch}</div>${o.after || ""}</div>`;
    },
    explain(ok, lines, title) {
      const kind = ok == null ? "warn" : ok ? "ok" : "no";
      return `<div class="eg-explain eg-explain--${kind}"><b>${esc(title || (ok ? "✓ ถูกต้อง" : ok == null ? "△ ทบทวน" : "✗ ยังไม่ถูก"))}</b>${(lines || []).filter(Boolean).map(l => `<span>${esc(l)}</span>`).join("")}</div>`;
    },
    foot: () => `<footer class="eg-foot"><img src="${ART}icon-64.png" alt="">โรงเรียนปิยมิตรวิทยา${window.EG_SECTION ? " " + SECTION_TXT[window.EG_SECTION] : ""} · อ.เชียงคำ จ.พะเยา</footer>`,
    // section / portal card (big choice)
    sectionCard({ title, sub, lines, href, cta, art, test, muted }) {
      return `<a class="eg-card eg-sect${muted ? " eg-sect--muted" : ""}"${attrs({ href, "data-test": test })}><img class="eg-sect__art" src="${ART}${art || "mascot-hello.svg"}" alt=""><div class="eg-stack eg-grow"><b class="eg-h1">${esc(title)}</b>${sub ? `<span class="eg-mut">${esc(sub)}</span>` : ""}${lines ? `<ul class="eg-list eg-sm eg-mut">${lines.map(l => `<li>${esc(l)}</li>`).join("")}</ul>` : ""}<span class="eg-btn eg-btn--primary eg-sect__cta">${esc(cta || "เข้าใช้งาน")} ›</span></div></a>`;
    },
    toast(msg) { const d = document.createElement("div"); d.className = "eg-toast"; d.setAttribute("role", "status"); d.textContent = msg; document.body.appendChild(d); setTimeout(() => d.remove(), 2600); },
    // apply data-driven widths (progress, score ring) after each render
    hydrate(root) {
      root.querySelectorAll("[data-p]").forEach(el => { el.style.width = el.dataset.p + "%"; });
      root.querySelectorAll("[data-ring]").forEach(el => { el.style.setProperty("--p", el.dataset.ring); });
    }
  };
  window.EGUI = UI;
})();
