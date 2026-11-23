"""
kq.py <cluster> <database> <kql> [--json] - 取 token 并执行一条 KQL（token 不进命令行）

用法:
    python scripts/kq.py https://aznwclusmc.chinanorth2.kusto.chinacloudapi.cn ASRKustoDB "print x=1"
    python scripts/kq.py <cluster> <db> "<kql>" --json     # 打印完整响应 JSON

说明:
    - 是 query-adx.py 的便捷封装：内部用 az account get-access-token 取 token，
      不再把 token 作为参数传入，避免 token 出现在命令行/日志/会话里；
    - KQL 以 `.` 开头走 /v1/rest/mgmt，否则走 /v2/rest/query；
    - 默认只打印结果表（列名 + 最多 50 行，单元格截断 300 字符），--json 才打印原始响应。
"""

import json
import subprocess
import sys

import requests

TIMEOUT = (10, 120)


def get_token(cluster):
    r = subprocess.run(
        ["az", "account", "get-access-token", "--resource", cluster,
         "--query", "accessToken", "-o", "tsv"],
        capture_output=True, text=True, shell=True, timeout=120,
    )
    token = r.stdout.strip() if r.returncode == 0 else ""
    return token or None


def _result_tables(payload):
    """兼容两种响应格式，只取结果表。

    - /v2/rest/query：frames 列表，TableKind == "PrimaryResult"
    - /v1/rest/mgmt ：{"Tables": [{"TableName", "Columns", "Rows"}]}
    """
    if isinstance(payload, dict) and isinstance(payload.get("Tables"), list):
        return payload["Tables"]
    frames = payload if isinstance(payload, list) else [payload]
    return [f for f in frames
            if isinstance(f, dict) and f.get("TableKind") == "PrimaryResult"]


def print_tables(payload, max_rows=50, max_cell=300):
    printed = 0
    for table in _result_tables(payload):
        cols = [c.get("ColumnName") for c in table.get("Columns", [])]
        rows = table.get("Rows", [])
        print(" | ".join(cols))
        print("-" * 60)
        for row in rows[:max_rows]:
            cells = []
            for v in row:
                s = v if isinstance(v, str) else json.dumps(v, ensure_ascii=False)
                s = s.replace("\r", " ").replace("\n", " ")
                cells.append(s if len(s) <= max_cell else s[:max_cell] + "...")
            print(" | ".join(cells))
        if len(rows) > max_rows:
            print(f"... ({len(rows) - max_rows} more rows)")
        print(f"rows={len(rows)}")
        printed += len(rows)
    return printed


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    want_json = "--json" in sys.argv
    if len(args) != 3:
        print("usage: python scripts/kq.py <cluster> <database> <kql> [--json]", file=sys.stderr)
        return 2
    cluster, database, kql = (a.strip() for a in args)

    token = get_token(cluster)
    if not token:
        print("token error: az account get-access-token failed, run az login", file=sys.stderr)
        return 1

    path = "/v1/rest/mgmt" if kql.startswith(".") else "/v2/rest/query"
    try:
        r = requests.post(cluster.rstrip("/") + path,
                          headers={"Authorization": f"Bearer {token}",
                                   "Content-Type": "application/json; charset=utf-8",
                                   "Accept": "application/json"},
                          json={"db": database, "csl": kql}, timeout=TIMEOUT)
    except requests.RequestException as e:
        print(f"query error: {type(e).__name__}: {e}", file=sys.stderr)
        return 1

    print("HTTP Status:", r.status_code)
    try:
        payload = r.json()
    except ValueError:
        print(r.text[:2000])
        return 0 if r.status_code == 200 else 1

    if want_json:
        print(json.dumps(payload, indent=2, ensure_ascii=False))
        return 0 if r.status_code == 200 else 1

    if print_tables(payload) == 0 and r.status_code != 200:
        print(json.dumps(payload, indent=2, ensure_ascii=False)[:2000])
    return 0 if r.status_code == 200 else 1


if __name__ == "__main__":
    sys.exit(main())
