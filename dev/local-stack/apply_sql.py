#!/usr/bin/env python3
"""Run .sql files against the local Postgres (stand-in for `psql -f`; psql is not installed on this box)."""
import sys, psycopg
dsn = sys.argv[1]
with psycopg.connect(dsn, autocommit=True) as c:
    for f in sys.argv[2:]:
        c.execute(open(f, encoding="utf-8").read())
        print("applied", f)
