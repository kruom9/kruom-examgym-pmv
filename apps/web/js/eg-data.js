/* Exam Gym · data layer (supabase-js → local stack in tests, kruom-examgym-ms in production; same code) */
(function () {
  const CFG = window.EXAMGYM_CONFIG || {};
  const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: "examgym-auth" } });
  const must = ({ data, error }) => { if (error) throw error; return data; };
  const D = {
    sb, CFG,
    M6_URL: CFG.M6_URL || "https://kruom9.github.io/kruom-cefr/examgym/m6-ios/",
    async user() { const { data } = await sb.auth.getSession(); return data.session ? data.session.user : null; },
    async profile() { const u = await D.user(); if (!u) return null; return must(await sb.from("profiles").select("*").eq("id", u.id).maybeSingle()); },
    async register(f) {
      let u = await D.user();
      if (!u) { must(await sb.auth.signInAnonymously()); u = await D.user(); }
      return must(await sb.rpc("register_student", { p_full_name: f.name, p_school: f.school, p_line_id: f.line, p_consent: f.consent, p_school_code: f.code || null, p_src: f.src || null }));
    },
    async setGrade(g, room) { return must(await sb.rpc("set_my_grade", { p_grade_code: g, p_room: room })); },
    async clearGrade() { const u = await D.user(); return must(await sb.from("profiles").update({ grade_code: null, room: null }).eq("id", u.id).select().single()); },
    async catalogue() {
      const [g, s, t, c] = await Promise.all([
        sb.from("grades").select("*").order("sort"), sb.from("subjects").select("*").order("sort"),
        sb.from("strands").select("*").order("sort"), sb.rpc("bank_counts")]);
      return { grades: must(g), subjects: must(s), strands: must(t), counts: must(c) };
    },
    async items(g) {
      const cols = "id,grade_code,subject_id,strand_id,course_code,difficulty,stem,choices,answer_index,answer_keys,hint,explanation,choice_notes,media,no_shuffle,status,source_label,review_flag";
      return must(await sb.from("items").select(cols).eq("grade_code", g).order("id").range(0, 4999));
    },
    async examSets(g) { return must(await sb.from("exam_sets").select("*").eq("grade_code", g).order("sort")); },
    async record(p) { return must(await sb.rpc("record_attempt", { p })); },
    async attempts(g, limit) { return must(await sb.from("attempts").select("*").eq("grade_code", g).order("submitted_at", { ascending: false }).limit(limit || 50)); },
    async attempt(id) { return must(await sb.from("attempts").select("*, answers(item_id,position,choice_index,is_correct,time_ms)").eq("id", id).maybeSingle()); },
    async teacherLogin(email, password) { must(await sb.auth.signInWithPassword({ email, password })); return D.profile(); },
    async view(name, g) { return must(await sb.from(name).select("*").eq("grade_code", g).range(0, 999)); },
    async teacherGrades(allGrades) {
      const p = await D.profile(); const s = must(await sb.from("teacher_scopes").select("grade_code"));
      const sec = must(await sb.from("teacher_section_scopes").select("section_code")).map(x => x.section_code);
      const fromSec = (allGrades || []).filter(g => p.role === "admin" || sec.includes(g.section_code)).map(g => g.code);
      return [...new Set([p.grade_code, ...s.map(x => x.grade_code), ...fromSec].filter(Boolean))].sort();
    },
    async rpc(name, args) { return must(await sb.rpc(name, args || {})); },
    async signOut() { await sb.auth.signOut(); }
  };
  window.EGData = D;
})();
