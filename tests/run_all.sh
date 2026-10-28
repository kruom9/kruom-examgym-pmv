#!/usr/bin/env bash
# LOCAL ONLY. Fresh stack → teacher → RLS (core + sections/dashboard) → ม.6 import check → student e2e
# → fake demo data → portal/dashboard e2e (headless Chromium, localhost only).
# Usage: bash tests/run_all.sh [--shots DIR]
set -e; cd "$(dirname "$0")/.."
bash dev/local-stack/stop.sh >/dev/null 2>&1 || true
bash dev/local-stack/start.sh
python3 tests/make_teacher.py
python3 tests/rls_test.py
python3 tests/rls_sections_dashboard.py
python3 tests/verify_m6.py
python3 tests/e2e_student.py "$@"
python3 tests/demo_seed_local.py
python3 tests/e2e_portal_dashboard.py "$@"
