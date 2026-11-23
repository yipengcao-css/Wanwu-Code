import subprocess
import json
import os
import shlex

CHINA_BLOB_SUFFIX = ".blob.core.chinacloudapi.cn"
CHINA_FILE_SUFFIX = ".file.core.chinacloudapi.cn"
CHINA_AAD_ENDPOINT = "https://login.chinacloudapi.cn"


class AzureChinaAzCopySkill:

    def __init__(self):
        self.auth_mode = None
        self._cloud_ok = False

    def _run(self, args, env_extra=None, timeout=90):
        try:
            env = os.environ.copy()
            if env_extra:
                env.update(env_extra)
            r = subprocess.run(["azcopy"] + args, capture_output=True, text=True, timeout=timeout, env=env)
            out, err = r.stdout.strip(), r.stderr.strip()
            if r.returncode != 0:
                return {"ok": False, "error": out or err or "command failed"}
            return {"ok": True, "data": out}
        except subprocess.TimeoutExpired:
            return {"ok": False, "error": "azcopy command timed out (90s)"}
        except FileNotFoundError:
            return {"ok": False, "error": "azcopy not found — install and add to PATH"}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def _az(self, args, timeout=90):
        try:
            r = subprocess.run(["az"] + args, capture_output=True, text=True, timeout=timeout, env=os.environ.copy())
            out, err = r.stdout.strip(), r.stderr.strip()
            if r.returncode != 0:
                return {"ok": False, "error": err or "command failed"}
            try:
                data = json.loads(out) if out else None
            except json.JSONDecodeError:
                data = out
            return {"ok": True, "data": data}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def _set_cloud(self):
        if not self._cloud_ok:
            self._az(["cloud", "set", "--name", "AzureChinaCloud"])
            self._cloud_ok = True

    @staticmethod
    def build_blob_url(account, container="", path="", sas=""):
        url = f"https://{account}{CHINA_BLOB_SUFFIX}"
        if container:
            url += f"/{container}"
        if path:
            url += f"/{path.lstrip('/')}"
        if sas:
            url += f"?{sas.lstrip('?')}"
        return url

    @staticmethod
    def build_file_url(account, share="", path="", sas=""):
        url = f"https://{account}{CHINA_FILE_SUFFIX}"
        if share:
            url += f"/{share}"
        if path:
            url += f"/{path.lstrip('/')}"
        if sas:
            url += f"?{sas.lstrip('?')}"
        return url

    def login_identity(self):
        r = self._run(["login", "--identity", "--aad-endpoint", CHINA_AAD_ENDPOINT], timeout=30)
        if r["ok"]:
            self.auth_mode = "identity"
            return {"status": "success", "message": "AzCopy 托管标识登录成功"}
        return {"status": "failed", "message": f"托管标识登录失败: {r['error']}",
                "hint": "请确认 VM 托管标识已分配 Storage Blob Data Contributor/Reader 角色"}

    def auto_login(self):
        r = self.login_identity()
        self._set_cloud()
        az_r = self._az(["login", "--identity"], timeout=30)
        if r["status"] == "success":
            msg = r["message"]
            if az_r["ok"]:
                msg += " | az CLI 也已登录"
            return {"status": "success", "message": msg}
        return {"status": "failed", "message": "AzCopy 自动登录失败",
                "hint": "可选: 1) 分配 Storage Blob Data Contributor 后重试 2) SAS Token 3) account_key"}

    def logout(self):
        self._run(["logout"])
        self.auth_mode = None
        return {"status": "success", "message": "AzCopy 已登出"}

    def execute(self, command, account_key=None):
        if command.startswith("azcopy "):
            command = command[7:]
        try:
            args = shlex.split(command, posix=False)
        except ValueError:
            args = command.split()
        env_extra = {}
        if account_key:
            env_extra["AZCOPY_ACCOUNT_KEY"] = account_key
        r = self._run(args, env_extra=env_extra)
        if r["ok"]:
            return {"status": "success", "output": r["data"]}
        return {"status": "error", "message": r["error"]}

    def list_blobs(self, account, container, path="", sas=""):
        url = self.build_blob_url(account, container, path, sas)
        return self.execute(f'list "{url}"')

    def list_storage_accounts(self, name_prefix=None):
        self._set_cloud()
        if name_prefix:
            q = f"[?starts_with(name,'{name_prefix}')].{{Name:name,RG:resourceGroup,Location:location,Kind:kind,Sku:sku.name}}"
        else:
            q = "[].{Name:name,RG:resourceGroup,Location:location,Kind:kind,Sku:sku.name}"
        r = self._az(["storage", "account", "list", "--query", q, "-o", "json"])
        if r["ok"]:
            return {"status": "success", "output": r["data"]}
        return {"status": "error", "message": r["error"]}

    def upload(self, local_path, account, container, blob_path="", sas="", recursive=False, account_key=None):
        url = self.build_blob_url(account, container, blob_path, sas)
        cmd = f'copy "{local_path}" "{url}"'
        if recursive:
            cmd += " --recursive"
        return self.execute(cmd, account_key=account_key)

    def download(self, account, container, blob_path, local_path, sas="", recursive=False, account_key=None):
        url = self.build_blob_url(account, container, blob_path, sas)
        cmd = f'copy "{url}" "{local_path}"'
        if recursive:
            cmd += " --recursive"
        return self.execute(cmd, account_key=account_key)

    def sync_upload(self, local_path, account, container, blob_path="", sas="", account_key=None):
        url = self.build_blob_url(account, container, blob_path, sas)
        return self.execute(f'sync "{local_path}" "{url}"', account_key=account_key)

    def sync_download(self, account, container, blob_path, local_path, sas="", account_key=None):
        url = self.build_blob_url(account, container, blob_path, sas)
        return self.execute(f'sync "{url}" "{local_path}"', account_key=account_key)

    def remove_blob(self, account, container, blob_path, sas="", recursive=False, account_key=None):
        url = self.build_blob_url(account, container, blob_path, sas)
        cmd = f'remove "{url}"'
        if recursive:
            cmd += " --recursive"
        return self.execute(cmd, account_key=account_key)

    def make_container(self, account, container, sas="", account_key=None):
        url = self.build_blob_url(account, container, sas=sas)
        return self.execute(f'make "{url}"', account_key=account_key)


skill = AzureChinaAzCopySkill()


def azure_azcopy_auto_login() -> str:
    """Smart login for AzCopy + az CLI (Azure China). Uses managed identity."""
    return json.dumps(skill.auto_login(), ensure_ascii=False)


def azure_azcopy_login_tenant(tenant_id: str) -> str:
    """Device code login for AzCopy (interactive, requires browser)."""
    r = skill._run(["login", "--tenant-id", tenant_id, "--aad-endpoint", CHINA_AAD_ENDPOINT], timeout=90)
    if r["ok"]:
        skill.auth_mode = "aad"
        return json.dumps({"status": "success", "message": "AzCopy AAD 登录成功", "output": r["data"]}, ensure_ascii=False)
    return json.dumps({"status": "failed", "message": f"AAD 登录失败: {r['error']}"}, ensure_ascii=False)


def azure_azcopy_logout() -> str:
    """Logout from AzCopy."""
    return json.dumps(skill.logout(), ensure_ascii=False)


def azure_azcopy_operate(command: str, account_key: str = None) -> str:
    """Execute an AzCopy command (Azure China). No confirmation needed.

    China URL: https://<account>.blob.core.chinacloudapi.cn/<container>/<path>

    Examples: 'list "https://myaccount.blob.core.chinacloudapi.cn/container"',
              'copy "C:\\file.txt" "https://myaccount.blob.core.chinacloudapi.cn/container"'
    """
    return json.dumps(skill.execute(command, account_key=account_key), ensure_ascii=False)


def azure_azcopy_list(account: str, container: str, path: str = "", sas_token: str = "") -> str:
    """List blobs in an Azure China storage container."""
    return json.dumps(skill.list_blobs(account, container, path, sas_token), ensure_ascii=False)


def azure_azcopy_list_accounts(name_prefix: str = None) -> str:
    """List Azure China storage accounts (az CLI ARM). Filter by name prefix."""
    return json.dumps(skill.list_storage_accounts(name_prefix), ensure_ascii=False)


def azure_azcopy_upload(local_path: str, account: str, container: str,
                        blob_path: str = "", sas_token: str = "",
                        recursive: bool = False, account_key: str = None) -> str:
    """Upload to Azure China Blob storage."""
    return json.dumps(skill.upload(local_path, account, container, blob_path, sas_token, recursive, account_key), ensure_ascii=False)


def azure_azcopy_download(account: str, container: str, blob_path: str,
                          local_path: str, sas_token: str = "",
                          recursive: bool = False, account_key: str = None) -> str:
    """Download from Azure China Blob storage."""
    return json.dumps(skill.download(account, container, blob_path, local_path, sas_token, recursive, account_key), ensure_ascii=False)


def azure_azcopy_sync(direction: str, local_path: str, account: str,
                      container: str, blob_path: str = "",
                      sas_token: str = "", account_key: str = None) -> str:
    """Sync files. direction: 'upload' | 'download'."""
    d = direction.lower().strip()
    if d == "upload":
        r = skill.sync_upload(local_path, account, container, blob_path, sas_token, account_key)
    elif d == "download":
        r = skill.sync_download(account, container, blob_path, local_path, sas_token, account_key)
    else:
        r = {"status": "error", "message": f"Unknown direction: {direction}. Use: upload|download"}
    return json.dumps(r, ensure_ascii=False)


def azure_azcopy_remove(account: str, container: str, blob_path: str,
                        sas_token: str = "", recursive: bool = False,
                        account_key: str = None) -> str:
    """Delete blob(s) from Azure China storage."""
    return json.dumps(skill.remove_blob(account, container, blob_path, sas_token, recursive, account_key), ensure_ascii=False)


def azure_azcopy_build_url(account: str, container: str = "",
                           blob_path: str = "", sas_token: str = "",
                           service: str = "blob") -> str:
    """Build Azure China storage URL. service: 'blob' | 'file'."""
    if service == "file":
        url = AzureChinaAzCopySkill.build_file_url(account, container, blob_path, sas_token)
    else:
        url = AzureChinaAzCopySkill.build_blob_url(account, container, blob_path, sas_token)
    return json.dumps({"url": url}, ensure_ascii=False)
