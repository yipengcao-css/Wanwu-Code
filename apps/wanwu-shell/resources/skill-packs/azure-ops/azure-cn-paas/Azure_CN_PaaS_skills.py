# -*- coding: utf-8 -*-
"""
Azure China PaaS Skill - OpenClaw 可用
通过 Azure CLI 对 Azure 中国世纪互联云 PaaS 资源进行读取操作。
登录方式：az login --identity（托管标识）
"""

import subprocess
import json
import os
import sys
from typing import Optional, Dict, Any, List

# 危险操作关键字，写操作需二次确认
DANGEROUS_ACTIONS = ['create', 'update', 'delete', 'add', 'remove', 'stop', 'start', 'restart', 'set', 'revoke', 'purge']

# 支持的 PaaS 资源类型与 Azure CLI 命令前缀（仅读操作为主）
RESOURCE_MAP = {
    'app-service': 'az webapp',
    'webapp': 'az webapp',
    'function': 'az functionapp',
    'functionapp': 'az functionapp',
    'api-management': 'az apim',
    'apim': 'az apim',
    'service-bus': 'az servicebus',
    'servicebus': 'az servicebus',
    'eventhub': 'az eventhubs',
    'eventhubs': 'az eventhubs',
    'redis': 'az redis',
    'redis-cache': 'az redis',
    'storage': 'az storage',
    'datalake': 'az storage',
    'data-lake': 'az storage',
    'keyvault': 'az keyvault',
    'key-vault': 'az keyvault',
    'logic-app': 'az logic',
    'logicapp': 'az logic',
    'app-insights': 'az monitor app-insights',
    'application-insights': 'az monitor app-insights',
}

# 默认仅允许的只读子命令（白名单，用于严格只读模式时可扩展）
READ_ONLY_VERBS = ['list', 'show', 'get']


class AzureChinaPaaSSkill:
    def __init__(self):
        self.cloud_env = "AzureChinaCloud"
        self.is_logged_in = False

    def _run_cli(self, args: List[str], check: bool = False) -> Dict[str, Any]:
        """执行 Azure CLI 命令，自动使用中国区云环境。"""
        try:
            env = os.environ.copy()
            result = subprocess.run(
                ["az"] + args,
                capture_output=True,
                text=True,
                check=check,
                env=env,
                timeout=120,
            )
            output = result.stdout
            try:
                return {"success": True, "data": json.loads(output), "stderr": result.stderr}
            except json.JSONDecodeError:
                return {"success": True, "data": output, "stderr": result.stderr}
        except subprocess.CalledProcessError as e:
            return {"success": False, "error": e.stderr or e.stdout or str(e), "returncode": e.returncode}
        except subprocess.TimeoutExpired:
            return {"success": False, "error": "命令执行超时"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def login_identity(self) -> Dict[str, Any]:
        """
        使用托管标识登录 Azure 中国区。
        必须先设置云环境为 AzureChinaCloud，再执行 az login --identity。
        """
        print(f"正在设置云环境为 {self.cloud_env}...")
        self._run_cli(["cloud", "set", "--name", self.cloud_env], check=False)

        print("正在使用托管标识登录 (az login --identity)...")
        result = self._run_cli(["login", "--identity"], check=False)

        if result["success"]:
            self.is_logged_in = True
            return {"status": "success", "message": "托管标识登录成功"}
        return {
            "status": "failed",
            "message": result.get("error", "登录失败"),
            "hint": "请确保运行环境已配置托管标识（如 VM/ACI/App Service 的 Managed Identity），或在此环境内使用 az login 交互登录。",
        }

    def ensure_cloud(self) -> None:
        """确保当前 CLI 云环境为中国区。"""
        self._run_cli(["cloud", "set", "--name", self.cloud_env], check=False)

    def check_command_safety(self, command_args: List[str]) -> bool:
        """检查是否为只读/安全操作；包含危险关键字则需确认。"""
        cmd_str = " ".join(command_args).lower()
        for action in DANGEROUS_ACTIONS:
            if action in cmd_str:
                return False
        return True

    def execute(self, command: str, confirmed: bool = False) -> Dict[str, Any]:
        """
        执行 PaaS 资源相关 Azure CLI 命令（以读取为主）。
        :param command: 完整 az 命令，例如 'webapp list -g MyRG' 或 'keyvault list'
        :param confirmed: 若为写操作，是否已获用户确认
        """
        raw = command.strip()
        if raw.startswith("az "):
            raw = raw[3:]
        args = raw.split()

        if not args:
            return {"status": "error", "message": "命令不能为空"}

        is_safe = self.check_command_safety(args)
        if not is_safe and not confirmed:
            return {
                "status": "confirmation_required",
                "message": f"⚠️ 检测到写/危险操作！\n即将执行：az {raw}\n请用户回复「确认执行」后再用 confirmed=True 调用，或「取消」终止。",
                "command": f"az {raw}",
            }

        self.ensure_cloud()
        print(f"执行命令：az {' '.join(args)}")
        result = self._run_cli(args, check=False)

        if result["success"]:
            return {"status": "success", "output": result["data"]}
        return {"status": "error", "message": result.get("error", "执行失败")}


# 单例，供 Agent 调用
skill = AzureChinaPaaSSkill()


# ---------- OpenClaw / OpenHands 兼容的 Action 函数 ----------

def azure_login_identity() -> str:
    """使用托管标识登录 Azure 中国区。必须先调用此接口完成登录后再执行资源读取。"""
    res = skill.login_identity()
    return json.dumps(res, ensure_ascii=False)


def azure_paas_operate(command: str, confirmed: bool = False) -> str:
    """
    对 Azure 中国区 PaaS 资源执行 Azure CLI 命令（以读取为主）。
    支持资源：App Service(webapp), Azure Function(functionapp), API Management(apim),
    Azure Service Bus(servicebus), Azure Event Hub(eventhubs), Azure Redis Cache(redis),
    Data Lake Storage Gen2(storage/datalake), Azure Key Vault(keyvault), Logic App(logic),
    Application Insights(monitor app-insights)。
    写操作首次调用会返回 confirmation_required，用户确认后需传入 confirmed=True 再次调用。
    """
    res = skill.execute(command, confirmed=confirmed)
    return json.dumps(res, ensure_ascii=False)
