import { useCallback, useEffect, useState } from "react";

type RuleRow = { name: string; scope: "user" | "workspace"; body: string };
type MemoryRow = { index: number; text: string };

export function RulesMemoryPanel(props: { open: boolean }) {
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [memories, setMemories] = useState<MemoryRow[]>([]);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [scope, setScope] = useState<"workspace" | "user">("workspace");
  const [status, setStatus] = useState<string | null>(null);

  const reload = useCallback(() => {
    void window.wanwu.library.list().then((r) => {
      setRules(r.rules);
      setMemories(r.memories);
    }).catch(() => {
      setRules([]);
      setMemories([]);
    });
  }, []);

  useEffect(() => {
    if (props.open) reload();
  }, [props.open, reload]);

  async function saveRule(): Promise<void> {
    try {
      await window.wanwu.library.writeRule({ name: name.trim(), body, scope });
      setName("");
      setBody("");
      setStatus("已保存规则");
      reload();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <section className="library-panel" aria-label="规则与记忆">
      <h3>规则与记忆</h3>
      <p className="field-hint">项目规则在 `.wanwu/rules`，个人规则在 `~/.wanwu/rules`。记忆来自 WANWU.md 的 Learned。</p>
      <ul className="library-list">
        {rules.map((rule) => (
          <li key={`${rule.scope}:${rule.name}`}>
            <span>
              {rule.name} · {rule.scope === "user" ? "个人" : "项目"}
            </span>
            <button
              type="button"
              className="btn"
              onClick={() => {
                void window.wanwu.library.deleteRule(rule.name, rule.scope).then(() => reload());
              }}
            >
              删除
            </button>
          </li>
        ))}
        {rules.length === 0 ? <li className="field-hint">还没有规则。</li> : null}
      </ul>
      <label className="field">
        <span className="field-label">新规则名</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="react-hooks" />
      </label>
      <label className="field">
        <span className="field-label">范围</span>
        <select value={scope} onChange={(e) => setScope(e.target.value === "user" ? "user" : "workspace")}>
          <option value="workspace">项目</option>
          <option value="user">个人</option>
        </select>
      </label>
      <label className="field">
        <span className="field-label">内容</span>
        <textarea value={body} rows={4} onChange={(e) => setBody(e.target.value)} />
      </label>
      <button type="button" className="btn" disabled={!name.trim()} onClick={() => void saveRule()}>
        保存规则
      </button>
      <h3>记忆</h3>
      <ul className="library-list">
        {memories.map((row) => (
          <li key={row.index}>
            <span>{row.text}</span>
            <button
              type="button"
              className="btn"
              onClick={() => {
                void window.wanwu.library.deleteMemory(row.index).then(() => reload());
              }}
            >
              删除
            </button>
          </li>
        ))}
        {memories.length === 0 ? <li className="field-hint">还没有记住的内容。</li> : null}
      </ul>
      {status ? <p className="settings-status">{status}</p> : null}
    </section>
  );
}
