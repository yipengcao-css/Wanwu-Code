"""
get_kusto_token.py <cluster > - 根据输入的Azure Data Explorer cluster得到访问cluster的token

用法:
    python get_kusto_token.py <cluster>

示例:
    python get_kusto_token.py https://aznwchinamc.chinanorth2.kusto.chinacloudapi.cn

参数说明:
    cluster  Azure Data Explorer cluster的连接url
注意:
    - 只能输入一个cluster连接
    - 当输出的code为 1 时，表示token无效，请告诉用户，使用Az CLI重新登录
    - 当输出的code为 0 时，表示token有效

作者: fu.zhangliang@oe.21vianet.com
版本: 1.1.0
"""

import subprocess
import sys

clusters = [
"https://acrmc2.chinaeast2.kusto.chinacloudapi.cn",
"https://akscn.kusto.chinacloudapi.cn",
"https://armmcadx.chinaeast2.kusto.chinacloudapi.cn",
"https://asradxclusmc.chinanorth2.kusto.chinacloudapi.cn",
"https://azcore.chinanorth3.kusto.chinacloudapi.cn",
"https://aznwchinamc.chinanorth2.kusto.chinacloudapi.cn",
"https://azurecm.chinanorth2.kusto.chinacloudapi.cn",
"https://mabprodmcadx.chinaeast2.kusto.chinacloudapi.cn",
"https://rmskustomc.chinanorth2.kusto.chinacloudapi.cn",
"https://azcrpmc.kusto.chinacloudapi.cn",
"https://azuredcmmc.kusto.chinacloudapi.cn",
"https://argmcn2nrpone.chinanorth2.kusto.chinacloudapi.cn",
"https://azurecdnmc.chinanorth3.kusto.chinacloudapi.cn",
"https://argmcn2arm1pone.chinanorth2.kusto.chinacloudapi.cn",
"https://mcakshuba.chinaeast2.kusto.chinacloudapi.cn",
"https://msodsmooncake.chinanorth2.kusto.chinacloudapi.cn",
"https://estscnn2.chinanorth2.kusto.chinacloudapi.cn",
"https://azdeployermc.kusto.chinacloudapi.cn",
"https://mckusto.chinanorth3.kusto.chinacloudapi.cn"
]

def get_token(cluster):
    cmd = [
        "az",
        "account",
        "get-access-token",
        "--resource",
        cluster,
        "--query",
        "accessToken",
        "-o",
        "tsv"
    ]
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=True,
            shell=True
        )
    except subprocess.CalledProcessError as e:
#        print(e.stdout)
#        print(e.stderr)
        return {"code":1, "token":"please ask user to run az login to login,No valid token found"}

    return {"code": 0, "token":result.stdout.strip() }

if __name__ == "__main__":
    if len(sys.argv) > 2 or len(sys.argv) <= 1:
        print("只支持传入一个cluster作为参数")
        exit(0)

    cluster = sys.argv[1].strip().strip('"\'')

    if cluster not in clusters:
        print("请输入合法的cluster，合法的cluster列表如下：")
        print(clusters)
        exit(0)

    result = get_token(cluster)
    code = result["code"]
    print("code:", code)
    # 如果code为1， 则表示token无效，需要重新az cli登录获得token,请告诉用户立即使用cli登录，不要进行后续查询
    if code == 1:
        print("token无效，请告诉用户，使用Az CLI重新登录")
    if code == 0:
        token = result["token"]
        print(token)
