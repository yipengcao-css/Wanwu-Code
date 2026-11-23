import gzip
import json
import os
import sys

p = os.path.join(os.path.expanduser("~"), ".azure", "msal_token_cache.bin")
try:
    raw = gzip.open(p).read()
except OSError as e:
    print("cannot read cache:", e)
    sys.exit(1)
j = json.loads(raw)
seen = {}
for acct in j.get("Account", {}).values():
    seen[(acct.get("username"), acct.get("realm"))] = acct.get("home_account_id", "")[:8]
for (user, realm), hid in sorted(seen.items()):
    print(f"{user} | tenant={realm} | home={hid}")
print(f"-- {len(seen)} account(s), AT entries={len(j.get('AccessToken', {}))}")
