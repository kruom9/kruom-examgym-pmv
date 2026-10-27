#!/usr/bin/env bash
# LOCAL ONLY. Fresh stack → teacher → RLS → ม.6 import check → e2e (headless Chromium, localhost only).
set -e; cd "$(dirname "$0")/.."
bash dev/local-stack/stop.sh >/dev/null 2>&1 || true
bash dev/local-stack/start.sh
python3 tests/make_teacher.py
python3 tests/rls_test.py
python3 tests/verify_m6.py
python3 tests/e2e_student.py "$@"
