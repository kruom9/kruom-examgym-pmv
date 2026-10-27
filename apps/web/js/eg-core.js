/* Exam Gym · adaptive practice + exam engine (logic adapted from Exam Gym ป.6; topic = บท/strand) */
(function () {
  const RULES = { upNeed: 4, upWindow: 5, downWrong: 2, round: 5, unlockTopicN: 5, roomUnlock: 70, testN: 20, testMin: 45, maxAttempts: 5, pass: 70,
    goal: 10, mix: [4, 6, 6, 4], noRepeat: 6, mockPer: 10, mockMin: 90, mockMix: [2, 3, 3, 2], mockNeed: 10 };
  const LV = ["ตั้งไข่", "ง่าย", "กลาง", "ยาก"]; const DAY = 864e5;
  const C = { RULES, LV, items: [], QID: {}, QBY: {}, strands: [], STR: {}, subjects: [], SUBJ: {} };
  C.mulberry32 = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  C.hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  C.shuffle = (a, r) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  C.load = function (subjects, strands, items) {
    C.subjects = subjects; C.SUBJ = Object.fromEntries(subjects.map(s => [s.id, s]));
    C.strands = strands; C.STR = Object.fromEntries(strands.map(s => [s.id, s]));
    C.items = items; C.QID = {}; C.QBY = {};
    items.forEach(q => { C.QID[q.id] = q; (C.QBY[q.strand_id + "|" + q.difficulty] = C.QBY[q.strand_id + "|" + q.difficulty] || []).push(q); });
  };
  C.strandsOf = sid => C.strands.filter(t => t.subject_id === sid && C.items.some(q => q.strand_id === t.id)).map(t => t.id);
  C.nItems = sid => C.items.filter(q => q.subject_id === sid).length;
  // ----- learner state (per user per grade, on device; every finished round/test is also saved to Supabase) -----
  C.key = (uid, g) => `eg:v1:${uid}:${g}`;
  C.loadP = (uid, g) => { try { const d = JSON.parse(localStorage.getItem(C.key(uid, g)) || "null"); if (d && d.v === 1) return d; } catch (e) { } return { v: 1, log: [], ts: {}, seen: {}, recent: [], tests: {}, rounds: 0 }; };
  C.saveP = (uid, g, P) => { try { localStorage.setItem(C.key(uid, g), JSON.stringify(P)); } catch (e) { } };
  const tstate = (P, tid) => P.ts[tid] || (P.ts[tid] = { level: 0, recent: [], wrong: 0 });
  C.level = (P, tid) => tstate(P, tid).level;
  // pick: current level of the บท, no recent repeats, prefer unseen > wrong > oldest (ป.6 rule). Falls to nearest level with items.
  C.pickQ = function (P, tid, rnd) {
    rnd = rnd || Math.random; let lv = tstate(P, tid).level; let pool = C.QBY[tid + "|" + lv] || [];
    for (let d = 1; !pool.length && d < 4; d++) pool = C.QBY[tid + "|" + (lv - d)] || C.QBY[tid + "|" + (lv + d)] || [];
    const recent = new Set(P.recent.slice(-RULES.noRepeat));
    let cand = pool.filter(q => !recent.has(q.id));
    if (!cand.length) { const last = P.recent[P.recent.length - 1]; cand = pool.filter(q => q.id !== last); if (!cand.length) cand = pool.slice(); }
    const score = q => { const s = P.seen[q.id]; if (!s) return 0; if (!s.c) return 1; return 2 + s.t / 1e13; };
    let best = Infinity; cand.forEach(q => best = Math.min(best, score(q)));
    const top = cand.filter(q => Math.floor(score(q)) === Math.floor(best));
    if (best >= 2) { top.sort((a, b) => P.seen[a.id].t - P.seen[b.id].t); return top[0]; }
    return top[Math.floor(rnd() * top.length)];
  };
  // 4 of the last 5 at a level → up; 2 wrong in a row → down
  C.applyAnswer = function (P, q, correct, ts, choice) {
    const st = tstate(P, q.strand_id), from = st.level;
    const e = { q: q.id, t: q.strand_id, s: q.subject_id, lv: q.difficulty, c: correct ? 1 : 0, ts, a: choice };
    P.log.push(e); P.seen[q.id] = { t: ts, c: e.c }; P.recent.push(q.id); if (P.recent.length > 12) P.recent.shift();
    let change = 0;
    if (q.difficulty === st.level) { st.recent.push(e.c); if (st.recent.length > RULES.upWindow) st.recent.shift(); }
    if (correct) { st.wrong = 0; if (st.recent.reduce((a, b) => a + b, 0) >= RULES.upNeed && st.level < 3) { st.level++; st.recent = []; change = 1; } }
    else { st.wrong++; if (st.wrong >= RULES.downWrong) { if (st.level > 0) { st.level--; change = -1; st.recent = []; } st.wrong = 0; } }
    return { change, from, to: st.level };
  };
  // mastery: recency weight 0.9^age × min(1, n/5)
  C.stats = function (P) {
    const S = {}; C.strands.forEach(t => S[t.id] = { n: 0, c: 0, w: 0, wc: 0, k: 0, m: 0 });
    for (let i = P.log.length - 1; i >= 0; i--) { const e = P.log[i], s = S[e.t]; if (!s) continue; const w = Math.pow(0.9, s.k++); s.n++; s.c += e.c; s.w += w; s.wc += w * e.c; }
    Object.values(S).forEach(s => { s.m = Math.round((s.w ? s.wc / s.w : 0) * Math.min(1, s.n / 5) * 100); });
    return S;
  };
  C.group = (S, tids) => { let m = 0, n = 0, c = 0; tids.forEach(t => { const s = S[t] || { m: 0, n: 0, c: 0 }; m += s.m; n += s.n; c += s.c; }); return { m: Math.round(m / Math.max(1, tids.length)), n, c }; };
  C.band = (m, n) => !n ? { k: 0, t: "ยังไม่เริ่ม" } : m < 50 ? { k: 1, t: "ต้องฝึกเพิ่ม" } : m < 75 ? { k: 2, t: "กำลังพัฒนา" } : { k: 3, t: "แม่นแล้ว" };
  C.strandOpen = (S, tid) => { const t = C.STR[tid]; const list = C.strandsOf(t.subject_id); const i = list.indexOf(tid); return i <= 0 || (S[list[i - 1]] || { n: 0 }).n >= RULES.unlockTopicN; };
  C.weakest = (S, tids) => { let b = null; tids.forEach(t => { if (!C.strandOpen(S, t)) return; if (!b || S[t].m < S[b].m) b = t; }); return b || tids[0]; };
  C.used = (P, setId) => (P.tests[setId] || []).length;
  C.liveSubjects = () => C.subjects.filter(s => C.nItems(s.id) > 0);
  // unlock: subject room = subject mastery ≥ 70 · mock = every subject ≥ 10 answered (ป.6 rule)
  C.setState = function (P, S, set) {
    if (P.unlockAll) return { open: true, prog: 100, text: "เปิดแล้ว" };
    if (set.kind === "subject_room") { const m = C.group(S, C.strandsOf(set.subject_id)).m; return { open: m >= RULES.roomUnlock, prog: Math.min(100, m / RULES.roomUnlock * 100), text: `ความแม่นวิชานี้ ${m}% / ${RULES.roomUnlock}%` }; }
    const subs = C.liveSubjects(); const ns = subs.map(s => C.group(S, C.strandsOf(s.id)).n); const ok = ns.filter(n => n >= RULES.mockNeed).length;
    return { open: ok === subs.length, prog: ns.reduce((a, n) => a + Math.min(n, RULES.mockNeed), 0) / (RULES.mockNeed * Math.max(1, subs.length)) * 100, text: `ฝึกครบ ${ok}/${subs.length} วิชา (วิชาละ ≥${RULES.mockNeed} ข้อ)` };
  };
  // build a paper: mix per level, capped by what the bank has, topped up from other levels
  function pickMix(pool, mix, n, r) {
    const out = [], used = new Set();
    mix.forEach((k, lv) => C.shuffle(pool.filter(q => q.difficulty === lv), r).slice(0, k).forEach(q => { out.push(q); used.add(q.id); }));
    C.shuffle(pool.filter(q => !used.has(q.id)), r).slice(0, Math.max(0, n - out.length)).forEach(q => out.push(q));
    return out.slice(0, n);
  }
  C.buildTest = function (set, seed) {
    const r = C.mulberry32(C.hash(seed));
    let qs;
    if (set.kind === "subject_room") qs = pickMix(C.items.filter(q => q.subject_id === set.subject_id), set.mix || RULES.mix, set.n_items, r);
    else qs = [].concat(...C.liveSubjects().map(s => pickMix(C.items.filter(q => q.subject_id === s.id), RULES.mockMix, set.per_subject || RULES.mockPer, r)));
    return qs.map(q => q.id);
  };
  C.isCorrect = (q, a) => a != null && (q.answer_keys || [q.answer_index]).includes(+a);
  C.gradeSet = function (qids, ans) {
    const per = {}, perS = {}; let c = 0;
    qids.forEach(id => { const q = C.QID[id]; const ok = C.isCorrect(q, ans[id]) ? 1 : 0; c += ok;
      (per[q.strand_id] = per[q.strand_id] || [0, 0])[0] += ok; per[q.strand_id][1]++; (perS[q.subject_id] = perS[q.subject_id] || [0, 0])[0] += ok; perS[q.subject_id][1]++; });
    const n = qids.length, pct = n ? Math.round(c / n * 100) : 0; return { correct: c, n, pct, pass: pct >= RULES.pass, per, perS };
  };
  C.streak = function (P) {
    const dk = ts => new Date(ts).toDateString(); const days = new Set(P.log.map(e => dk(e.ts)));
    let n = 0, d = Date.now(); if (!days.has(dk(d))) d -= DAY; while (days.has(dk(d))) { n++; d -= DAY; }
    return { streak: n, today: P.log.filter(e => dk(e.ts) === dk(Date.now())).length };
  };
  C.fmtT = s => { s = Math.max(0, Math.round(s)); return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"); };
  C.fmtDate = ts => new Date(ts).toLocaleString("th-TH", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" });
  window.EGCore = C;
})();
