import { describe, expect, it } from "vitest";
import { assessBash, assessToolCall, isReadOnlyBash } from "./permission.js";

describe("permission matcher", () => {
  it("hard-denies reading ssh keys", () => {
    const v = assessBash("cat ~/.ssh/id_rsa");
    expect(v.allow).toBe(false);
    expect(v.requiresPrompt).toBe(false);
  });

  it("requires prompt for rm -rf in ask mode", () => {
    const v = assessBash("rm -rf ./dist", "ask");
    expect(v.allow).toBe(false);
    expect(v.requiresPrompt).toBe(true);
    expect(v.risk).toBe("high");
  });

  it("catches recursive rm regardless of flag order / long form", () => {
    for (const cmd of [
      "rm -fr ./build",
      "rm --recursive --force ./build",
      "rm -R ./build",
      "echo hi && rm -rf ./cache",
    ]) {
      const v = assessBash(cmd, "ask");
      expect(v.allow, cmd).toBe(false);
      expect(v.requiresPrompt, cmd).toBe(true);
      expect(v.risk, cmd).toBe("high");
    }
  });

  it("hard-denies catastrophic recursive rm on root/home in every mode", () => {
    for (const cmd of [
      "rm -rf /",
      "rm -rf /*",
      "rm -fr ~",
      "rm -rf ~/projects",
      "rm -rf --no-preserve-root /",
      "rm --recursive --force $HOME",
    ]) {
      for (const mode of ["ask", "accept-edits", "accept-all"] as const) {
        const v = assessBash(cmd, mode);
        expect(v.allow, `${cmd} @ ${mode}`).toBe(false);
        expect(v.requiresPrompt, `${cmd} @ ${mode}`).toBe(false);
      }
    }
  });

  it("does not misfire on benign commands containing 'rm' or -r", () => {
    expect(assessBash("npm run build").allow).toBe(true);
    expect(assessBash("grep -r pattern src && rm ./tmpfile", "ask").allow).toBe(true);
    expect(assessBash("rm ./one-file.txt", "ask").allow).toBe(true);
  });

  it("blocks force push", () => {
    const v = assessBash("git push origin main --force");
    expect(v.allow).toBe(false);
  });

  it("allows benign commands", () => {
    const v = assessBash("pnpm test");
    expect(v.allow).toBe(true);
    expect(v.risk).toBe("low");
  });

  it("gates edits in ask mode", () => {
    const v = assessToolCall("Edit", "src/sum.js", "ask");
    expect(v.allow).toBe(false);
    expect(v.requiresPrompt).toBe(true);
  });
});

describe("isReadOnlyBash", () => {
  it("treats common inspection commands as read-only", () => {
    for (const cmd of [
      "ls -la",
      "cat README.md",
      "grep -r foo src",
      "rg pattern",
      "git status",
      "git log --oneline -5",
      "git diff HEAD~1",
      "find . -name '*.ts'",
      "head -n 20 file.txt | wc -l",
      "node -v",
      "pnpm --version",
      "echo hello 2>&1",
      "sed -n '1,5p' file.txt",
    ]) {
      expect(isReadOnlyBash(cmd), cmd).toBe(true);
    }
  });

  it("treats mutating commands as NOT read-only", () => {
    for (const cmd of [
      "echo hi > out.txt",
      "cat a >> b.txt",
      "mkdir newdir",
      "touch file",
      "rm file.txt",
      "git commit -m x",
      "git push",
      "git checkout -b feature",
      "pnpm install",
      "npm run build",
      "sed -i 's/a/b/' file",
      "cat $(cat cmd.txt)",
      "NODE_ENV=prod node server.js",
      "cp a b",
      "mv a b",
    ]) {
      expect(isReadOnlyBash(cmd), cmd).toBe(false);
    }
  });

  it("is conservative: a read-only prefix chained with a mutation is not read-only", () => {
    expect(isReadOnlyBash("ls && rm file")).toBe(false);
    expect(isReadOnlyBash("cat x.txt; touch y")).toBe(false);
  });
});