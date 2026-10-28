// PUBLIC frontend config (committed on purpose). Only the project URL + the publishable (public) key belong here.
// NEVER put the service_role / secret key or a DB password in this file. Row Level Security protects all data.
window.EXAMGYM_CONFIG = {
  SUPABASE_URL: "https://flqejubdqeyynmkphcho.supabase.co",          // kruom-examgym-ms (มัธยม · kruom9's Org · ap-southeast-1)
  SUPABASE_ANON_KEY: "sb_publishable_2fh-G8mTX3uuaTHH_l_nmg_gfYNLE3d", // publishable key (public by design)
  M6_URL: "https://kruom9.github.io/kruom-cefr/examgym/m6-ios/",        // live ม.6 app until its migration is approved
  PRATHOM: {
    P6_URL: "https://kruom9.github.io/kruom-xexamgym-p6/",             // live ป.6 app
    SUPABASE_URL: null   // placeholder: ประถม project = kruom-examgym-p6 (owner Peter) — NOT wired; pending his review
  }
};
