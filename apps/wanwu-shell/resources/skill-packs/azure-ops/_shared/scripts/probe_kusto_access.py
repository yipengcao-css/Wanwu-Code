"""
probe_kusto_access.py - 批量探测 clusters.json 中各 ADX 集群的访问权限

用法:
    python scripts/probe_kusto_access.py             # 探测全部集群
    python scripts/probe_kusto_access.py --db <db>   # 指定统一 database（默认用 clusters.json 里的）

行为:
    - 从 ../clusters.json 读取集群列表；
    - 用 az account get-access-token 为每个集群获取 token（不打印 token 本体）；
    - 每个集群执行 `print x=1`（query）与 `.show databases`（mgmt）；
    - 结果判定：
        200            -> 可访问
        403            -> 已认证，但无该数据库权限（UnauthorizedDatabaseAccessException）
        401            -> token 不被该集群接受（租户/身份未授权）
      mgmt 200 且 `"Rows": []` 表示"已认证但没有任何可见数据库"。

注意: 依赖 az cli 已登录（az login），且已安装 requests。
"""

import json
import shutil
import subprocess
import sys
from pathlib import Path

try:
    import requests
except ImportError:
    print("需要 requests: pip install requests", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent
CLUSTERS_FILE = ROOT / "clusters.json"
TIMEOUT = (10, 60)
# Windows 上 az 实际是 az.CMD，必须经 cmd.exe（shell=True）才能执行
AZ = shutil.which("az") or "az"


def get_token(cluster):
    """调用 az cli 获取 token；返回 (token, err)。"""
    cmd = f'"{AZ}" account get-access-token --resource "{cluster}" --query accessToken -o tsv'
    try:
        out = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=120)
    except (OSError, subprocess.SubprocessError) as e:
        return None, f"az invocation failed: {e}"
    if out.returncode != 0:
        lines = (out.stderr or out.stdout).strip().splitlines()
        return None, (lines[-1] if lines else "az error")
    return (out.stdout.strip() or None), None


def post(cluster, database, csl, token):
    """执行一次查询，返回 (status_code, message)。"""
    url = f"{cluster}/v1/rest/mgmt" if csl.startswith(".") else f"{cluster}/v2/rest/query"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json; charset=utf-8",
        "Accept": "application/json",
    }
    try:
        r = requests.post(url, headers=headers, json={"db": database, "csl": csl},
                          timeout=TIMEOUT)
    except requests.RequestException as e:
        return None, f"network: {type(e).__name__}: {e}"
    if r.status_code == 200:
        return 200, "OK"
    return r.status_code, r.text.strip().replace("\n", " ")[:220]


def main():
    clusters = json.loads(CLUSTERS_FILE.read_text(encoding="utf-8"))
    database = None
    if "--db" in sys.argv:
        database = sys.argv[sys.argv.index("--db") + 1]

    rows = []
    for item in clusters:
        cluster = item["KUSTO_CLUSTER_URL"]
        db = database or item["KUSTO_DEFAULT_DATABASE"]
        token, err = get_token(cluster)
        if not token:
            rows.append((cluster, db, "TOKEN", err))
            print(f"[TOKEN-FAIL] {cluster} -> {err}", flush=True)
            continue

        q_status, q_msg = post(cluster, db, "print x=1", token)
        m_status, m_msg = post(cluster, db, ".show databases", token)
        # mgmt 200 但 Rows 为空 = 已认证但没有任何可见数据库
        no_db = " 无可见库" if m_status == 200 and '"Rows": []' in m_msg else ""
        rows.append((cluster, db, q_status, q_msg))
        flag = "OK " if q_status == 200 else "ERR"
        detail = "" if q_status == 200 else q_msg
        print(f"[{flag}] {cluster} db={db} query={q_status} mgmt={m_status}{no_db} :: {detail}",
              flush=True)

    ok = [r for r in rows if r[2] == 200]
    print(f"\n汇总: {len(ok)}/{len(rows)} 个集群可访问")
    print(json.dumps([{"cluster": r[0], "db": r[1], "status": r[2]} for r in rows],
                     indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
