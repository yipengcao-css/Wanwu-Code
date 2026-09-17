import { useEffect, useState } from "react";

type Item = { name: string; path?: string };
type ContextInfo = { memory: Item[]; skills: Item[]; hooks: Item[]; rules: Item[]; mcp: Item[] };

export function ContextModal(props: { onOpenFile: (path: string) => void; onClose: () => void }) {
  const [info, setInfo] = useState<ContextInfo | null>(null);

  useEffect(() => {
    void window.wanwu.context.discover().then(setInfo);
  }, []);

  function section(title: string, items: Item[], desc: string) {
    return (
      <div className="ctx-section">
        <div className="ctx-title">
          {title} <span className="ctx-count">{items.length}</span>
        </div>
        <div className="ctx-desc">{desc}</div>
        {items.length === 0 ? (
          <div className="ctx-empty">（无）</div>
        ) : (
          items.map((it) => (
            <button
              type="button"
              key={it.name}
              className="ctx-item"
              disabled={!it.path}
              onClick={() => it.path && (props.onClose(), props.onOpenFile(it.path))}
            >
              {it.name}
            </button>
          ))
        )}
      </div>
    );
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={props.onClose}>
      <div className="modal ctx-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Agent 上下文 · Memory / Skills / Rules / MCP</h3>
        {!info ? (
          <div className="empty">扫描中…</div>
        ) : (
          <div className="ctx-grid">
            {section("Memory", info.memory, "项目记忆（WANWU.md / AGENTS.md / CLAUDE.md），随 prompt 注入")}
            {section("Skills", info.skills, ".wanwu/skills/*.md")}
            {section("Hooks", info.hooks, ".wanwu/hooks/*")}
            {section("Rules", info.rules, "项目规则 / 配置")}
            {section("MCP", info.mcp, "已配置的 MCP 服务器（.wanwu/settings.toml 或 ~/.wanwu/config.toml）")}
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className="btn primary" onClick={props.onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
