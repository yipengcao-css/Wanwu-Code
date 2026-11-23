"""
query-adx.py <cluster> <database> <kusto_query> <token>

用法:
    python query-adx.py <cluster> <database> <kusto_query> <token>

示例:
    python query-adx.py https://mabprodmcadx.chinaeast2.kusto.chinacloudapi.cn MABKustoProd ".show tables" "<token>"

参数:
    cluster      Azure Data Explorer cluster 连接 url
    database     database 名称
    kusto_query  KQL 语句（含 | 字符，必须整体作为一个参数传入）
    token        cluster 访问 token，由 get_kusto_token.py <cluster> 获得

注意:
    - 必须 4 个参数；token 无内置默认值，必须显式传入。
    - KQL 含 | 字符。PowerShell 中用单引号包裹最稳（双引号里的 $ 会被展开）；
      cmd 中可用半角双引号包裹。
    - 本脚本仅作为 MCP(kusto-mcp) 不可用时的回退路径，正常情况下优先使用 MCP 工具。

作者: fu.zhangliang@oe.21vianet.com
版本: 1.2.0
"""

import requests
import json
import sys


def query_kusto(cluster, database, kusto_query, token):
    kusto_query = kusto_query.strip()
    if not token:
        print("query error: token 为空，请先运行 get_kusto_token.py <cluster> 获取 token",
              file=sys.stderr)
        return "query error"

    if kusto_query.startswith("."):
        url = f"{cluster}/v1/rest/mgmt"
    else:
        url = f"{cluster}/v2/rest/query"

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json; charset=utf-8",
        "Accept": "application/json"
    }
    body = {"db": database, "csl": kusto_query}

    # 必须设置超时：requests 默认无超时，集群无响应或网络中断时会无限期挂起并阻塞调用方。
    try:
        response = requests.post(url, headers=headers, json=body, timeout=(10, 600))
    except requests.exceptions.Timeout:
        print("query error: 请求超时（建连 10s / 读取 600s），请检查网络连通性或缩小查询时间范围后重试",
              file=sys.stderr)
        return "query error"
    except requests.exceptions.RequestException as e:
        print(f"query error: 请求失败 {e}", file=sys.stderr)
        return "query error"

    print("HTTP Status:", response.status_code)
    if response.status_code != 200:
        print(response.text)
        return "query error"

    print(json.dumps(response.json(), indent=2, ensure_ascii=False))


if __name__ == "__main__":
    if len(sys.argv) != 5:
        print("参数数量错误：需要 4 个参数 <cluster> <database> <kusto_query> <token>，"
              "实际收到 {} 个。".format(len(sys.argv) - 1), file=sys.stderr)
        print("用法: python query-adx.py <cluster> <database> <kusto_query> <token>",
              file=sys.stderr)
        print('注意: kusto_query 必须整体传入；PowerShell 下建议用单引号包裹以避免 $ 展开和 | 截断。',
              file=sys.stderr)
        sys.exit(1)

    query_kusto(cluster=sys.argv[1], database=sys.argv[2],
                kusto_query=sys.argv[3], token=sys.argv[4])
