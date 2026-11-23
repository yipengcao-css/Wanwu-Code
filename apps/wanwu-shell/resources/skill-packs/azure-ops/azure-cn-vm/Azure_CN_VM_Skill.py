import subprocess
import json
import os
import re
import shlex

JMESPATH_CN_MAP = {
    '名称': 'Name', '资源组': 'ResourceGroup', '位置': 'Location',
    '状态': 'PowerState', '大小': 'VMSize', '类型': 'Type',
    '私有IP': 'PrivateIP', '公网IP': 'PublicIP', '操作系统': 'OS',
    '磁盘大小': 'SizeGB', '磁盘状态': 'DiskState', '区域': 'Location',
    '创建时间': 'TimeCreated', '电源状态': 'PowerState',
}


class AzureChinaVMSkill:

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
                "hint": "请调用 azure_vm_login(username, password) 或手动 az login"}

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
                "hint": "请调用 azure_vm_login(username, password) 或手动 az login"}

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

    def list_vms(self, resource_group=None):
        cmd = "vm list --show-details"
        if resource_group:
            cmd += f" -g {resource_group}"
        cmd += ' --query "[].{Name:name,ResourceGroup:resourceGroup,Location:location,VMSize:hardwareProfile.vmSize,PowerState:powerState,PrivateIP:privateIps,PublicIP:publicIps,OS:storageProfile.osDisk.osType}" -o json'
        return self.execute(cmd)

    def start_vm(self, name, rg):
        return self.execute(f"vm start -n {name} -g {rg} --no-wait")

    def stop_vm(self, name, rg):
        return self.execute(f"vm stop -n {name} -g {rg} --no-wait")

    def deallocate_vm(self, name, rg):
        return self.execute(f"vm deallocate -n {name} -g {rg} --no-wait")

    def restart_vm(self, name, rg):
        return self.execute(f"vm restart -n {name} -g {rg} --no-wait")

    def resize_vm(self, name, rg, size):
        return self.execute(f"vm resize -n {name} -g {rg} --size {size}")

    def run_command(self, name, rg, scripts):
        return self.execute(f'vm run-command invoke -n {name} -g {rg} --command-id RunShellScript --scripts "{scripts}"')

    def list_snapshots(self, rg=None):
        cmd = "snapshot list"
        if rg:
            cmd += f" -g {rg}"
        cmd += ' --query "[].{Name:name,RG:resourceGroup,SizeGB:diskSizeGb,Created:timeCreated}" -o json'
        return self.execute(cmd)

    def create_snapshot(self, name, rg, source):
        return self.execute(f"snapshot create -n {name} -g {rg} --source {source}")

    def delete_snapshot(self, name, rg):
        return self.execute(f"snapshot delete -n {name} -g {rg}")


skill = AzureChinaVMSkill()


def azure_vm_auto_login(username: str = None, password: str = None) -> str:
    """Smart login for Azure China (managed identity first, password fallback)."""
    return json.dumps(skill.auto_login(username, password), ensure_ascii=False)


def azure_vm_login(username: str, password: str) -> str:
    """Password login for Azure China."""
    return json.dumps(skill.login(username, password), ensure_ascii=False)


def azure_vm_operate(command: str) -> str:
    """Execute an Azure China VM az CLI command (omit 'az' prefix). Auto-retries on auth failure.

    Examples: 'vm list --show-details -o table', 'vm start -n MyVM -g MyRG --no-wait'
    """
    return json.dumps(skill.execute(command), ensure_ascii=False)


def azure_vm_list(resource_group: str = None) -> str:
    """List all VMs with status, IPs, and size."""
    return json.dumps(skill.list_vms(resource_group=resource_group), ensure_ascii=False)


def azure_vm_power(action: str, name: str, resource_group: str) -> str:
    """VM power: 'start' | 'stop' | 'restart' | 'deallocate' (--no-wait)."""
    dispatch = {'start': skill.start_vm, 'stop': skill.stop_vm,
                'deallocate': skill.deallocate_vm, 'restart': skill.restart_vm}
    fn = dispatch.get(action.lower().strip())
    if fn:
        return json.dumps(fn(name, resource_group), ensure_ascii=False)
    return json.dumps({"status": "error", "message": f"Unknown action: {action}"}, ensure_ascii=False)


def azure_vm_run_command(name: str, resource_group: str, scripts: str) -> str:
    """Execute a shell script inside a VM via Run Command."""
    return json.dumps(skill.run_command(name, resource_group, scripts), ensure_ascii=False)


def azure_vm_resize(name: str, resource_group: str, new_size: str) -> str:
    """Resize a VM."""
    return json.dumps(skill.resize_vm(name, resource_group, new_size), ensure_ascii=False)


def azure_vm_snapshot(action: str, snapshot_name: str, resource_group: str,
                      source_disk: str = None) -> str:
    """Snapshot management. action: 'list' | 'create' | 'delete'. source_disk required for create."""
    action = action.lower().strip()
    if action == 'list':
        return json.dumps(skill.list_snapshots(resource_group), ensure_ascii=False)
    if action == 'create':
        if not source_disk:
            return json.dumps({"status": "error", "message": "source_disk required"}, ensure_ascii=False)
        return json.dumps(skill.create_snapshot(snapshot_name, resource_group, source_disk), ensure_ascii=False)
    if action == 'delete':
        return json.dumps(skill.delete_snapshot(snapshot_name, resource_group), ensure_ascii=False)
    return json.dumps({"status": "error", "message": f"Unknown action: {action}"}, ensure_ascii=False)
