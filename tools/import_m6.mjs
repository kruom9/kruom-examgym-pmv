#!/usr/bin/env node
// Import the EXISTING Exam Gym ม.6 question banks AS-IS (read-only source).
// Source: kruom9/kruom-cefr, commit 5620e4c (branch `shuffle`, now also on main), path examgym/m6-ios.
// - Copies data/*_bank.js byte-for-byte into content/m6/banks/ (sha256 recorded and verified).
// - Writes content/m6/m6_items.json: every item unchanged (stem, choices, key, k, e, f, after, img, table) plus
//   the ม.6 app's own no-shuffle decision, computed by running ITS fixedWhy() code (copied at import time from app.js).
// - Never reads/copies: config.js, fb.js, dash*.js, accounts, passwords, SALT, ROOM_CODE, Sheet data. Images are referenced, not copied.
import fs from "node:fs"; import path from "node:path"; import crypto from "node:crypto"; import vm from "node:vm"; import { execSync } from "node:child_process";
const SRC = process.env.M6_SRC || "/workspace/kruom/kruom-cefr-shuffle/examgym/m6-ios";
const REPO = path.resolve(SRC, "../..");
const OUT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../content/m6");
const EXPECT = "5620e4c";
const commit = execSync(`git -C ${REPO} rev-parse HEAD`).toString().trim();
if (!commit.startsWith(EXPECT)) { console.error(`source worktree is at ${commit}, expected ${EXPECT}`); process.exit(1); }
const dirty = execSync(`git -C ${REPO} status --porcelain -- examgym/m6-ios`).toString().trim();
if (dirty) { console.error("source has local changes; refusing:\n" + dirty); process.exit(1); }
const app = fs.readFileSync(path.join(SRC, "app.js"), "utf8");
// ม.6 app subject list + its shuffle rules (verbatim slices of app.js)
const subjSrc = app.slice(app.indexOf("var SUBJECTS = ["), app.indexOf("];", app.indexOf("var SUBJECTS = [")) + 2);
const a = app.indexOf("var CH_REF"), b = app.indexOf("function h32(");
if (a < 0 || b < 0) throw new Error("shuffle rules not found in app.js");
const rules = app.slice(a, b);
const MAP = { soc: "SO", thai: "TH", eng: "EN", phy: "PH", chem: "CH", bio: "BI", sci: "SC", tgat1: "TG1", tgat2: "TG2", tgat3: "TG3" };
const ctx = { window: {} }; vm.createContext(ctx);
vm.runInContext(subjSrc + "; this.SUBJECTS = SUBJECTS;", ctx);
const manifest = { source: { repo: "kruom9/kruom-cefr", path: "examgym/m6-ios", commit, branch: "shuffle (also origin/main)", imported_at: new Date().toISOString(),
  rule: "AS-IS: items unchanged, no items added or rewritten; shuffle = ม.6 app rule (seeded per student + attempt + item; fixedWhy() items stay unshuffled)" }, banks: [] };
const items = [];
for (const s of ctx.SUBJECTS) {
  const file = `${s.id}_bank.js`, p = path.join(SRC, "data", file);
  const buf = fs.readFileSync(p); const sha = crypto.createHash("sha256").update(buf).digest("hex");
  fs.writeFileSync(path.join(OUT, "banks", file), buf);
  if (crypto.createHash("sha256").update(fs.readFileSync(path.join(OUT, "banks", file))).digest("hex") !== sha) throw new Error("copy mismatch " + file);
  const c = { window: {} }; vm.createContext(c); vm.runInContext(buf.toString("utf8"), c);
  const varName = Object.keys(c.window)[0]; const BANK = c.window[varName];
  const r = { BANK, SUB: s.id }; vm.createContext(r); vm.runInContext(rules + "; this.fixedWhy = fixedWhy;", r);
  const reasons = {};
  for (const it of BANK.items) {
    const why = r.fixedWhy(it) || "";
    reasons[why || "shuffle"] = (reasons[why || "shuffle"] || 0) + 1;
    items.push({ bank: s.id, subject: MAP[s.id], var: varName, item: it, no_shuffle: !!why, shuffle_reason: why || null });
  }
  manifest.banks.push({ id: s.id, subject: MAP[s.id], name: s.name, exam_code: s.exam.replace(/\s+[\u0E00-\u0E7F].*$/, ""), title: BANK.meta.title, file, sha256: sha, bytes: buf.length,
    n_items: BANK.items.length, n_saras: BANK.saras.length, n_mocks: (BANK.mocks || []).length, shuffle: reasons,
    saras: BANK.saras.map(x => ({ id: x.id, name: x.name, topics: (x.topics || []).map(t => ({ id: t.id, name: t.name })) })),
    mocks: (BANK.mocks || []).map(m => ({ id: m.id, name: m.name, n: (m.ids || []).length, min: m.min || null })),
    meta: { checked: BANK.meta.checked, source: BANK.meta.source } });
}
fs.writeFileSync(path.join(OUT, "m6_items.json"), JSON.stringify(items));
fs.writeFileSync(path.join(OUT, "m6_manifest.json"), JSON.stringify(manifest, null, 1));
console.log(`commit ${commit.slice(0, 7)} · ${items.length} items`);
for (const b of manifest.banks) console.log(`  ${b.id.padEnd(6)} ${b.subject.padEnd(4)} ${String(b.n_items).padStart(4)} items · ${b.n_saras} สาระ · ${b.n_mocks} mocks · ${JSON.stringify(b.shuffle)}`);
