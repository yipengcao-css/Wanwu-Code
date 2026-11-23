"""
sync_skills.py - 把同级 skill 文件夹的 SKILL.md 镜像到本工作区，供 agent 直接读取

背景:
    本 agent 的 workspace 是 $WANWU_SKILLS_ROOT/_shared，沙箱只允许读写 workspace 内的文件，
    因此无法直接 Read ../<skill>/SKILL.md。本脚本把各 skill 的 SKILL.md 复制到
    _shared/.agents/skills/<name>/SKILL.md（Wanwu 识别的 skill 目录结构），
    让 agent 可以用普通 Read 工具直接看全文，也可用 [SKILLS=agents/<name>] 按需加载。

用法:
    python scripts/sync_skills.py              # 增量同步（只更新有变化的文件）
    python scripts/sync_skills.py --check      # 只校验，不写盘；有差异退出码 1
    python scripts/sync_skills.py --prune      # 同时删除源里已不存在的镜像
    python scripts/sync_skills.py --src <dir>  # 指定源目录（默认 ../../）

约定:
    - 源目录默认是 _shared 的上一级（即 skills/skills）；
    - 跳过 _shared 自身与没有 SKILL.md 的目录；
    - 镜像目录 .agents/skills 视为生成物，不要手改。
"""

import argparse
import filecmp
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEST = ROOT / ".agents" / "skills"


def collect(src):
    out = {}
    for folder in sorted(src.iterdir()):
        if not folder.is_dir() or folder.name.startswith(".") or folder.name == ROOT.name:
            continue
        skill = folder / "SKILL.md"
        if skill.is_file():
            out[folder.name] = skill
    return out


def main():
    ap = argparse.ArgumentParser(description="镜像同级 skill 的 SKILL.md 到 .agents/skills")
    ap.add_argument("--src", default=str(ROOT.parent), help="源目录（默认 _shared 的上一级）")
    ap.add_argument("--check", action="store_true", help="只校验，不写盘")
    ap.add_argument("--prune", action="store_true", help="删除源中已不存在的镜像")
    args = ap.parse_args()

    src = Path(args.src).resolve()
    if not src.is_dir():
        print(f"ERROR: source dir not found: {src}")
        return 2

    skills = collect(src)
    added, updated, same = [], [], []
    missing = []

    for name, skill in skills.items():
        target = DEST / name / "SKILL.md"
        if not target.is_file():
            missing.append(name)
            if not args.check:
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(skill, target)
                added.append(name)
        elif not filecmp.cmp(skill, target, shallow=False):
            updated.append(name)
            if not args.check:
                shutil.copy2(skill, target)
        else:
            same.append(name)

    stale = []
    if DEST.is_dir():
        stale = [p.name for p in DEST.iterdir() if p.is_dir() and p.name not in skills]
        if args.prune and not args.check:
            for name in stale:
                shutil.rmtree(DEST / name)

    if args.check:
        for name in missing:
            print(f"MISSING {name}")
        for name in updated:
            print(f"DRIFT   {name}")
        for name in stale:
            print(f"STALE   {name}")
        ok = not (missing or updated or stale)
        print(f"checked {len(skills)} skills: "
              + ("all in sync" if ok else "out of sync, run: python scripts/sync_skills.py"))
        return 0 if ok else 1

    print(f"source: {src}")
    print(f"added {len(added)} / updated {len(updated)} / unchanged {len(same)}"
          + (f" / pruned {len(stale)}" if args.prune and stale else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
