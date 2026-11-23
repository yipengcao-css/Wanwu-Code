"""schema.py <cluster> <db> <tableRegex> - 打印匹配表的列名（.show tables schema as json 解析）

用法: python scripts/schema.py <cluster> <db> "(?i)^(CoreAzureBackupDPP)$"
"""

import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kqm  # noqa: E402


def main():
    if len(sys.argv) < 4:
        print(__doc__, file=sys.stderr)
        return 2
    cluster, db, pat = sys.argv[1], sys.argv[2], sys.argv[3]
    rx = re.compile(pat)
    token = kqm.get_token(cluster)
    if not token:
        print("token error: run az login", file=sys.stderr)
        return 1
    st, p = kqm.run(cluster, db, ".show tables schema as json", token)
    if st != 200:
        print(f"HTTP {st}: {json.dumps(p, ensure_ascii=False)[:800]}")
        return 1
    for r in kqm.tables(p)[0][1]:
        name = str(r[0])
        if not rx.search(name):
            continue
        try:
            cols = json.loads(r[1]).get("OrderedColumns", [])
        except Exception:  # noqa: BLE001
            print(f"{name}: <unparsable>")
            continue
        print(f"\n## {name} ({len(cols)} cols)")
        for c in cols:
            print(f"  {c['Name']} : {c['CslType']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
