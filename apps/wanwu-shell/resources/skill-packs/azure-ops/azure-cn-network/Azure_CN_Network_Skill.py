import subprocess
import json
import os
import re
import shlex

JMESPATH_CN_MAP = {
    '名称': 'Name', '资源组': 'ResourceGroup', '位置': 'Location',
    '状态': 'State', '类型': 'Type', '区域': 'Location',
    '地址空间': 'AddressSpace', '子网': 'Subnets',
}


class AzureChinaNetworkSkill:

    def __init__(self):
        self.cloud = "AzureChinaCloud"
        self._cloud_ok = False

    def _cli(self, args, timeout=90):
        try:
            r = subprocess.run(
                ["az"] + args,
                capture_output=True, text=True, timeout=timeout,
                env=os.environ.copy(),
            )
            out, err = r.stdout.strip(), r.stderr.strip()
            if r.returncode != 0:
                return {"ok": False, "error": err or "command failed"}
            try:
                data = json.loads(out) if out else None
            except json.JSONDecodeError:
                data = out
            return {"ok": True, "data": data}
        except subprocess.TimeoutExpired:
            return {"ok": False, "error": "command timed out (90s)"}
        except FileNotFoundError:
            return {"ok": False, "error": "az CLI not found"}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def _set_cloud(self):
        if not self._cloud_ok:
            self._cli(["cloud", "set", "--name", self.cloud])
            self._cloud_ok = True

    @staticmethod
    def _is_auth_error(msg):
        low = msg.lower()
        return any(k in low for k in ['login', 'token', 'credential', 'unauthorized', '认证', '登录', '没有可用'])

    @staticmethod
    def _fix_jmespath(cmd):
        def _replace(m):
            q = m.group(1)
            for cn, en in JMESPATH_CN_MAP.items():
                q = q.replace(cn, en)
            return re.sub(r'[^\x00-\x7F]+', 'Field', q)
        cmd = re.sub(r'--query\s+["\']([^"\']+)["\']', lambda m: f'--query "{_replace(m)}"', cmd)
        cmd = re.sub(r'--query\s+([^\s"\'][^\s]*)', lambda m: f'--query {_replace(m)}', cmd)
        return cmd

    def login_identity(self):
        self._set_cloud()
        r = self._cli(["login", "--identity"], timeout=30)
        if r["ok"]:
            info = ""
            if isinstance(r["data"], list) and r["data"]:
                s = r["data"][0]
                info = f" | 订阅: {s.get('name', '')} ({s.get('id', '')})"
            return {"status": "success", "message": f"托管标识登录成功{info}"}
        return {"status": "failed", "message": f"托管标识登录失败: {r['error']}",
                "hint": "请调用 azure_network_login(username, password) 或手动 az login"}

    def login(self, username, password):
        self._set_cloud()
        r = self._cli(["login", "-u", username, "-p", password])
        if r["ok"]:
            return {"status": "success", "message": "密码登录成功"}
        return {"status": "failed", "message": f"登录失败: {r['error']}",
                "hint": "MFA 账号请手动: az cloud set --name AzureChinaCloud && az login"}

    def auto_login(self, username=None, password=None):
        r = self.login_identity()
        if r["status"] == "success":
            return r
        if username and password:
            return self.login(username, password)
        return {"status": "failed", "message": "自动登录失败",
                "hint": "请调用 azure_network_login(username, password) 或手动 az login"}

    def execute(self, command):
        if command.startswith("az "):
            command = command[3:]
        command = self._fix_jmespath(command)
        try:
            args = shlex.split(command, posix=False)
        except ValueError:
            args = command.split()
        self._set_cloud()
        r = self._cli(args)
        if not r["ok"] and self._is_auth_error(r["error"]):
            self._cli(["login", "--identity"], timeout=30)
            r = self._cli(args)
        if r["ok"]:
            return {"status": "success", "output": r["data"]}
        return {"status": "error", "message": r["error"]}


skill = AzureChinaNetworkSkill()


def azure_network_auto_login(username: str = None, password: str = None) -> str:
    """Smart login for Azure China (managed identity first, password fallback)."""
    return json.dumps(skill.auto_login(username, password), ensure_ascii=False)


def azure_network_login(username: str, password: str) -> str:
    """Password login for Azure China."""
    return json.dumps(skill.login(username, password), ensure_ascii=False)


def azure_network_operate(command: str) -> str:
    """Execute an Azure China network az CLI command (omit 'az' prefix). Auto-retries on auth failure.

    Supported: nsg, vnet, private-dns, dns, private-endpoint, vnet-gateway,
    route-table, application-gateway, afd, traffic-manager, express-route

    Examples: 'network vnet list -g MyRG -o table', 'network nsg list -g MyRG -o table'
    """
    return json.dumps(skill.execute(command), ensure_ascii=False)
