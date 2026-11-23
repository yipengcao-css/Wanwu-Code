import json, subprocess, sys  
import requests  
from kusto_probe import get_token  
def q(cluster, db, kql, token, tmo=30):  
    ep = (chr(47) + 'v1' + chr(47) + 'rest' + chr(47) + 'mgmt') if kql.startswith('.') else (chr(47) + 'v2' + chr(47) + 'rest' + chr(47) + 'query')  
    try:  
        r = requests.post(cluster + ep, headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'}, json={'db': db, 'csl': kql}, timeout=(6, tmo))  
    except Exception as e:  
        return 'ERR', str(e)[:120]  
    try:  
        return r.status_code, r.json()  
    except Exception:  
        return r.status_code, r.text[:200]  
def rows_of(p):  
    try:  
        return p['Tables'][0]['Rows']  
    except Exception:  
        return []  
def main():  
    for c in [a.strip().rstrip(chr(47)) for a in sys.argv[1:] if a.strip()]:  
        t = get_token(c)  
        print('=' * 78)  
        print(c, 'token=' + str(bool(t)))  
        if not t:  
            continue  
        st, p = q(c, '', '.show databases', t, 40)  
        rs = rows_of(p)  
        print(' .show databases', st, 'dbs=' + str(len(rs)))  
        if st != 200:  
            print('   ', str(p)[:200])  
            continue  
        for row in rs:  
            name = str(row[0])  
            st2, p2 = q(c, name, '.show tables', t, 25)  
            r2 = rows_of(p2)  
            detail = ('TABLES=' + str(len(r2)) + ' :: ' + ','.join(str(x[0]) for x in r2[:6])) if st2 == 200 else str(p2)[:150].replace(chr(10), ' ')  
            print('   db=' + name, st2, detail)  
if __name__ == '__main__':  
    main()  
