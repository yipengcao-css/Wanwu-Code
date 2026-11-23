"""find_tables.py [regex] [--filter <clusterSubstring>] - 并发扫描 clusters.json 所有集群/可见库，列表名匹配正则的表

用法:
    python scripts/find_tables.py
    python scripts/find_tables.py "(?i)(cpu|memory|disk)" --filter azurecm
"""

import concurrent.futures as cf
import json
import os
import re
import sys

import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kusto_probe import get_token  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
CLUSTERS = os.path.join(os.path.dirname(HERE), "clusters.json")
DEFAULT = r"(?i)(metric|perf|counter|cpu|memory|disk|guest|insight)"


def q(cluster, db, kql, token, tmo=25):
    ep = "/v1/rest/mgmt" if kql.startswith(".") else "/v2/rest/query"
    try:
        r = requests.post(cluster + ep,
                          headers={"Authorization": f"Bearer {token}",
                                   "Content-Type": "application/json"},
                          json={"db": db, "csl": kql}, timeout=(6, tmo))
    except Exception as e:  # noqa: BLE001
        return "ERR", str(e)[:120]
    try:
        return r.status_code, r.json()
    except ValueError:
        return r.status_code, r.text[:200]


def rows_of(p):
    try:
        return p["Tables"][0]["Rows"]
    except Exception:  # noqa: BLE001
        return []


def scan(cluster, pat):
    token = get_token(cluster)
    if not token:
        return [f"{cluster}: TOKEN_FAIL"]
    st, p = q(cluster, "", ".show databases", token, 30)
    if st != 200:
        return [f"{cluster}: dbs {st}"]
    out = []
    for db in [str(r[0]) for r in rows_of(p)]:
        st2, p2 = q(cluster, db, ".show tables | project TableName", token, 30)
        if st2 != 200:
            out.append(f"{cluster} | {db} | tables ERR {st2}")
            continue
        names = [str(r[0]) for r in rows_of(p2)]
        hits = [n for n in names if pat.search(n)]
        out.append(f"{cluster} | {db} | tables={len(names)} | hits={len(hits)}")
        out += [f"    {n}" for n in hits[:30]]
    return out


def main():
    args = sys.argv[1:]
    pat_s = args[0] if args and not args[0].startswith("--") else DEFAULT
    filt = args[args.index("--filter") + 1] if "--filter" in args else ""
    pat = re.compile(pat_s)
    clusters = [c["KUSTO_CLUSTER_URL"].rstrip("/")
                for c in json.load(open(CLUSTERS, encoding="utf-8"))]
    if filt:
        clusters = [c for c in clusters if filt.lower() in c.lower()]
    with cf.ThreadPoolExecutor(max_workers=8) as ex:
        for lines in ex.map(lambda c: scan(c, pat), clusters):
            for ln in lines:
                print(ln, flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
