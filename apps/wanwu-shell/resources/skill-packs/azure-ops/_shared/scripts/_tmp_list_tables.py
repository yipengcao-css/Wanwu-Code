import json
import sys

raw = open('tables.json', encoding='utf-8', errors='ignore').read()
start = raw.find('{')
print('rawlen', len(raw), 'start', start, file=sys.stderr)
d = json.loads(raw[start:])
names = [r[0] for t in d['Tables'] for r in t['Rows']]
print('count', len(names))
kw = ['Health', 'Tunnel', 'Ike', 'Vpn', 'VPN', 'Gateway', 'Connection', 'Site']
hits = [n for n in names if any(k in n for k in kw)]
for n in hits:
    print(n)
