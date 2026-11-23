"""kqm.py <cluster> <db> <kqlFileOrInline> [...] - 一次取 token 跑多条 KQL，只打印主结果表（去掉诊断帧噪声）

用法:
    python scripts/kqm.py <cluster> <db> "print 1"
    python scripts/kqm.py <cluster> <db> q1.kql q2.kql
    python scripts/kqm.py <cluster> <db> --rows 20 --cell 500 "..."
"""

import json
import os
import subprocess
import sys

import requests

TIMEOUT = (10, 180)
NOISE_FIRST_COL = {"Value", "Timestamp", "Ordinal", "Property"}


def get_token(cluster):
    r = subprocess.run(
        ["az", "account", "get-access-token", "--resource", cluster,
         "--query", "accessToken", "-o", "tsv"],
        capture_output=True, text=True, shell=True, timeout=120,
    )
    token = r.stdout.strip() if r.returncode == 0 else ""
    return token or None


def run(cluster, db, kql, token):
    path = "/v1/rest/mgmt" if kql.startswith(".") else "/v2/rest/query"
    r = requests.post(cluster.rstrip("/") + path,
                      headers={"Authorization": f"Bearer {token}",
                               "Content-Type": "application/json; charset=utf-8",
                               "Accept": "application/json"},
                      json={"db": db, "csl": kql}, timeout=TIMEOUT)
    try:
        return r.status_code, r.json()
    except ValueError:
        return r.status_code, {"raw": r.text[:1500]}


def tables(payload):
    if isinstance(payload, dict) and isinstance(payload.get("Tables"), list):
        return [([c.get("ColumnName") for c in t.get("Columns", [])], t.get("Rows", []))
                for t in payload["Tables"]]
    frames = payload if isinstance(payload, list) else [payload]
    out = []
    for f in frames:
        if not isinstance(f, dict) or f.get("TableKind") not in (None, "PrimaryResult"):
            continue
        cols = [c.get("ColumnName") for c in f.get("Columns", [])]
        if not cols or (len(cols) == 1 and cols[0] in NOISE_FIRST_COL):
            continue
        out.append((cols, f.get("Rows", [])))
    return out


def show(cols, rows, max_rows, max_cell):
    print(" | ".join(str(c) for c in cols))
    for row in rows[:max_rows]:
        cells = []
        for v in row:
            s = v if isinstance(v, str) else json.dumps(v, ensure_ascii=False)
            s = s.replace("\r", " ").replace("\n", " ")
            cells.append(s if len(s) <= max_cell else s[:max_cell] + "...")
        print(" | ".join(cells))
    if len(rows) > max_rows:
        print(f"... ({len(rows) - max_rows} more rows)")
    print(f"[rows={len(rows)}]")


def main():
    args = sys.argv[1:]

    def opt(name, default):
        if name in args:
            i = args.index(name)
            val = args[i + 1]
            del args[i:i + 2]
            return val
        return default

    max_rows = int(opt("--rows", 40))
    max_cell = int(opt("--cell", 400))
    if len(args) < 3:
        print(__doc__, file=sys.stderr)
        return 2
    cluster, db, targets = args[0], args[1], args[2:]
    token = get_token(cluster)
    if not token:
        print("token error: run az login", file=sys.stderr)
        return 1

    for t in targets:
        kql = open(t, encoding="utf-8").read().strip() if os.path.exists(t) else t
        print(f"\n=== {t if os.path.exists(t) else kql[:120]}")
        try:
            st, payload = run(cluster, db, kql, token)
        except requests.RequestException as e:
            print(f"query error: {type(e).__name__}: {e}")
            continue
        if st != 200:
            print(f"HTTP {st}: {json.dumps(payload, ensure_ascii=False)[:1200]}")
            continue
        ts = tables(payload)
        if not ts:
            print("(empty)")
        for cols, rows in ts:
            show(cols, rows, max_rows, max_cell)
    return 0


if __name__ == "__main__":
    sys.exit(main())
