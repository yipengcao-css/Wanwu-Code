"""
kusto_probe.py - 用 clusters.json 批量验证 ADX 访问权限（只读探测）

用法:
    python scripts/kusto_probe.py            # 全部集群，query 与 mgmt 各探一次
    python scripts/kusto_probe.py --mgmt     # 只跑 .show databases（可发现可见数据库）

说明:
    - 集群列表与默认库来自 ../clusters.json；
    - token 用 az account get-access-token 现取现用，不落盘、不打印；
    - 输出每行: cluster | db | query=code | mgmt=code | 详情；
    - 判定: 200=可访问(或可见库为空) / 403=已认证但无库权限 / 401=token 不被集群接受。
"""

import json
import subprocess
import sys
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
TIMEOUT = (10, 60)


def get_token(cluster):
    r = subprocess.run(
        ["az", "account", "get-access-token", "--resource", cluster,
         "--query", "accessToken", "-o", "tsv"],
        capture_output=True, text=True, shell=True, timeout=120,
    )
    token = r.stdout.strip() if r.returncode == 0 else ""
    return token or None


def post(cluster, database, csl, token):
    sep = chr(47)
    path = (sep + "v1" + sep + "rest" + sep + "mgmt") if csl.startswith(".") \
        else (sep + "v2" + sep + "rest" + sep + "query")
    try:
        r = requests.post(cluster + path,
                          headers={"Authorization": f"Bearer {token}",
                                   "Content-Type": "application/json; charset=utf-8",
                                   "Accept": "application/json"},
                          json={"db": database, "csl": csl}, timeout=TIMEOUT)
    except requests.RequestException as e:
        return None, f"network: {type(e).__name__}"
    text = r.text.strip().replace("\n", " ")
    return r.status_code, text[:200]


def main():
    clusters = json.loads((ROOT / "clusters.json").read_text(encoding="utf-8"))
    mgmt_only = "--mgmt" in sys.argv
    for item in clusters:
        cluster = item["KUSTO_CLUSTER_URL"]
        db = item["KUSTO_DEFAULT_DATABASE"]
        token = get_token(cluster)
        if not token:
            print(f"{cluster} | {db} | TOKEN_FAIL")
            continue
        q = ("-", "skipped") if mgmt_only else post(cluster, db, "print x=1", token)
        m = post(cluster, db, ".show databases", token)
        empty = " (0 dbs visible)" if '"Rows": []' in m[1] else ""
        print(f"{cluster} | {db} | query={q[0]} | mgmt={m[0]}{empty} | {q[1]}")


if __name__ == "__main__":
    main()
