export type WanwuMode = "ask" | "plan" | "agent" | "verify";

const MODES: WanwuMode[] = ["ask", "plan", "agent", "verify"];

export function OrbitBar(props: {
  mode: WanwuMode;
  onMode: (m: WanwuMode) => void;
  onOpenFolder: () => void;
  onToggleTerminal: () => void;
  onSave: () => void;
  onOpenSettings: () => void;
  workspaceLabel: string;
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
            {m[0]!.toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>
      <span className="orbit-ws" title={props.workspaceLabel}>
        {props.workspaceLabel}
      </span>
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
