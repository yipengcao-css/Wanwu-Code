#!/usr/bin/env node
/**
 * Build a clean Azure ops skill pack under apps/wanwu-shell/resources/skill-packs/azure-ops
 * from the user's upload zip (or WANWU_AZURE_PACK_ZIP).
 */
import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const dest = join(repo, "apps/wanwu-shell/resources/skill-packs/azure-ops");
const defaultZip = join(
  process.env.HOME ?? "/tmp",
  ".cursor/projects/agent-repos-wanwu-code/uploads/wanwu-skills-pack_8bc4.zip",
);
const zipPath = process.env.WANWU_AZURE_PACK_ZIP?.trim() || defaultZip;

function pathRewrite(text) {
  return text
    .replace(/skills\/_shared/g, "$WANWU_SKILLS_ROOT/_shared")
    .replace(/skills\\_shared/g, "$WANWU_SKILLS_ROOT\\_shared");
}

function shouldSkip(name) {
  return (
    name === "__pycache__" ||
    name === ".wanwu" ||
    name === ".agents" ||
    name === "frontend-design-3" ||
    name === "mcp.servers.generated.json" ||
    name.startsWith(".")
  );
}

function copyTree(src, dst) {
  mkdirSync(dst, { recursive: true });
  for (const name of readdirSync(src)) {
    if (shouldSkip(name)) continue;
    const from = join(src, name);
    const to = join(dst, name);
    const st = statSync(from);
    if (st.isDirectory()) copyTree(from, to);
    else {
      let body = readFileSync(from);
      if (/\.(md|mdx|py|ps1|mjs|cjs|json|kql)$/i.test(name)) {
        writeFileSync(to, pathRewrite(body.toString("utf8")), "utf8");
      } else {
        cpSync(from, to);
      }
    }
  }
}

function normalizeAzureCn(srcRoot, destRoot, folder, outName, instructionFile) {
  const src = join(srcRoot, folder);
  if (!existsSync(src)) return;
  const out = join(destRoot, outName);
  mkdirSync(out, { recursive: true });
  const instr = join(src, instructionFile);
  const skillMd = join(src, "SKILL.md");
  let skillBody = "";
  if (existsSync(skillMd)) {
    skillBody = readFileSync(skillMd, "utf8");
  } else if (existsSync(instr)) {
    const raw = readFileSync(instr, "utf8");
    skillBody = `---\nname: ${outName}\ndescription: "Azure China ${outName} operations"\n---\n\n${raw}`;
  }
  if (skillBody) writeFileSync(join(out, "SKILL.md"), pathRewrite(skillBody), "utf8");
  for (const name of readdirSync(src)) {
    if (name === "SKILL.md" || name === instructionFile || name === "instructions.md") continue;
  if (shouldSkip(name)) continue;
    const from = join(src, name);
    const to = join(out, name);
    const st = statSync(from);
    if (st.isDirectory()) copyTree(from, to);
    else {
      const text = /\.(md|py|ps1)$/i.test(name);
      if (text) writeFileSync(to, pathRewrite(readFileSync(from, "utf8")), "utf8");
      else cpSync(from, to);
    }
  }
}

function main() {
  if (!existsSync(zipPath)) {
    console.error(`missing pack zip: ${zipPath}`);
    process.exit(1);
  }
  const staging = join(repo, ".tmp-azure-pack");
  rmSync(staging, { recursive: true, force: true });
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  execSync(`unzip -q ${JSON.stringify(zipPath)} -d ${JSON.stringify(staging)}`, { stdio: "inherit" });

  const root = join(staging, "skills - Copy");
  const skillsSrc = join(root, "skills");
  if (!existsSync(skillsSrc)) {
    console.error("zip missing skills - Copy/skills/");
    process.exit(1);
  }

  mkdirSync(dest, { recursive: true });
  for (const name of readdirSync(skillsSrc)) {
    if (shouldSkip(name)) continue;
    if (name === "_shared") {
      const sharedDst = join(dest, "_shared");
      copyTree(join(skillsSrc, "_shared"), sharedDst);
      rmSync(join(sharedDst, ".agents"), { recursive: true, force: true });
      rmSync(join(sharedDst, ".wanwu"), { recursive: true, force: true });
      continue;
    }
    const from = join(skillsSrc, name);
    if (!statSync(from).isDirectory()) continue;
    copyTree(from, join(dest, name));
  }

  normalizeAzureCn(root, dest, "Azure_CN_AzCopy_Skill", "azure-cn-azcopy", "instruction.md");
  normalizeAzureCn(root, dest, "Azure_CN_keyvault_Skill", "azure-cn-keyvault", "instruction.md");
  normalizeAzureCn(root, dest, "Azure_CN_Network_Skill", "azure-cn-network", "instruction.md");
  normalizeAzureCn(root, dest, "Azure_CN_PaaS_Skill", "azure-cn-paas", "instructions.md");
  normalizeAzureCn(root, dest, "Azure_CN_VM_Skill", "azure-cn-vm", "instruction.md");

  const mcpExample = `[mcp.servers.kusto-mcp]
command = "npx"
args = ["-y", "kusto-mcp"]
env = { KUSTO_AUTH_METHOD = "azure-cli" }

# Install once: npm i -g kusto-mcp  (or rely on npx above)
# Copy to ~/.wanwu/mcp.toml and adjust cluster URLs per skill (_shared/clusters.json).
`;
  writeFileSync(join(dest, "_shared", "mcp.kusto.example.toml"), mcpExample, "utf8");
  writeFileSync(
    join(dest, "README.md"),
    `# Azure ops skill pack (Wanwu)

Installed to \`~/.wanwu/skill-packs/azure-ops/\` on first Shell launch.

- Set \`WANWU_SKILLS_ROOT\` to this folder (Shell sets it automatically).
- Shared scripts: \`$WANWU_SKILLS_ROOT/_shared/scripts/\`
- Kusto MCP: see \`_shared/mcp.kusto.example.toml\` → \`~/.wanwu/mcp.toml\`
`,
    "utf8",
  );

  rmSync(staging, { recursive: true, force: true });
  const count = readdirSync(dest).filter((n) => existsSync(join(dest, n, "SKILL.md")) || n.endsWith(".md")).length;
  console.log(`OK: staged azure-ops pack → ${dest} (${count}+ entries)`);
}

main();