export type WanwuMode = "ask" | "plan" | "agent" | "verify" | "debug";

const MODES: WanwuMode[] = ["ask", "plan", "agent", "verify", "debug"];

const MODE_LABEL: Record<WanwuMode, string> = {
  ask: "Ask",
  plan: "Plan",
  agent: "Agent",
  verify: "Verify",
  debug: "Debug",
};

export function OrbitBar(props: {
  mode: WanwuMode;
  onMode: (m: WanwuMode) => void;
  onOpenFolder: () => void;
  onOpenRecent?: (dir: string) => void;
  onToggleTerminal: () => void;
  onSave: () => void;
  onOpenSettings: () => void;
  workspaceLabel: string;
  recentWorkspaces?: string[];
}) {
  return (
    <header className="orbit">
      <div className="logo">
        <span className="logo-mark" aria-hidden />
        <span>Wanwu</span>
      </div>
      <div className="mode-pill" role="tablist" aria-label="工作模式">
        {MODES.map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={props.mode === m}
            className={props.mode === m ? "active" : ""}
            onClick={() => props.onMode(m)}
          >
            {MODE_LABEL[m]}
          </button>
        ))}
      </div>
      <details className="recent-ws">
        <summary className="orbit-ws" title={props.workspaceLabel}>
          {props.workspaceLabel}
        </summary>
        <div className="recent-ws-menu" role="menu">
          {(props.recentWorkspaces ?? []).length === 0 ? (
            <p className="field-hint">还没有最近打开的项目。</p>
          ) : (
            (props.recentWorkspaces ?? []).map((dir) => (
              <button key={dir} type="button" role="menuitem" onClick={() => props.onOpenRecent?.(dir)}>
                {dir}
              </button>
            ))
          )}
        </div>
      </details>
      <div className="orbit-actions">
        <button type="button" className="btn" onClick={props.onOpenFolder}>
          打开文件夹
        </button>
        <button type="button" className="btn" onClick={props.onSave}>
          保存文件
        </button>
        <button type="button" className="btn" onClick={props.onToggleTerminal}>
          终端
        </button>
        <button type="button" className="btn primary" onClick={props.onOpenSettings}>
          模型设置
        </button>
      </div>
    </header>
  );
}
