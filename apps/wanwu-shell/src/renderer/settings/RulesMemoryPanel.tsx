import { useCallback, useEffect, useRef, useState } from "react";

type RuleRow = { name: string; scope: "user" | "workspace"; body: string };
type MemoryRow = { index: number; text: string };

export function RulesMemoryPanel(props: { open: boolean }) {
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [memories, setMemories] = useState<MemoryRow[]>([]);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [scope, setScope] = useState<"workspace" | "user">("workspace");
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

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

  useEffect(() => {
    if (!editing) return;
    bodyRef.current?.scrollIntoView({ block: "center" });
    bodyRef.current?.focus();
  }, [editing, name]);

  function resetForm(): void {
    setName("");
    setBody("");
    setScope("workspace");
    setEditing(false);
  }

  function beginEdit(rule: RuleRow): void {
    setName(rule.name);
    setBody(rule.body);
    setScope(rule.scope);
    setEditing(true);
    setStatus(null);
  }

  async function saveRule(): Promise<void> {
    try {
      await window.wanwu.library.writeRule({ name: name.trim(), body, scope });
      setStatus(editing ? "已更新规则" : "已保存规则");
      resetForm();
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
            <span className="library-actions">
              <button type="button" className="btn" onClick={() => beginEdit(rule)}>
                编辑
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  if (editing && name === rule.name && scope === rule.scope) resetForm();
                  void window.wanwu.library.deleteRule(rule.name, rule.scope).then(() => reload());
                }}
              >
                删除
              </button>
            </span>
          </li>
        ))}
        {rules.length === 0 ? <li className="field-hint">还没有规则。</li> : null}
      </ul>
      <label className="field">
        <span className="field-label">{editing ? "规则名" : "新规则名"}</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="react-hooks"
          disabled={editing}
        />
      </label>
      <label className="field">
        <span className="field-label">范围</span>
        <select
          value={scope}
          disabled={editing}
          onChange={(e) => setScope(e.target.value === "user" ? "user" : "workspace")}
        >
          <option value="workspace">项目</option>
          <option value="user">个人</option>
        </select>
      </label>
      <label className="field">
        <span className="field-label">内容</span>
        <textarea ref={bodyRef} value={body} rows={4} onChange={(e) => setBody(e.target.value)} />
      </label>
      <div className="library-actions">
        <button type="button" className="btn" disabled={!name.trim()} onClick={() => void saveRule()}>
          {editing ? "更新规则" : "保存规则"}
        </button>
        {editing ? (
          <button type="button" className="btn" onClick={resetForm}>
            取消
          </button>
        ) : null}
      </div>
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
