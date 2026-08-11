export type WanwuMode = "ask" | "plan" | "agent" | "verify";

const MODES: WanwuMode[] = ["ask", "plan", "agent", "verify"];

export function OrbitBar(props: {
  mode: WanwuMode;
  onMode: (m: WanwuMode) => void;
  onOpenFolder: () => void;
  onToggleTerminal: () => void;
  onSave: () => void;
  workspaceLabel: string;
}) {
  return (
    <header className="orbit">
      <div className="logo">
        <span className="logo-mark" aria-hidden />
        <span>Wanwu</span>
      </div>
      <div className="mode-pill" role="group" aria-label="Mode">
        {MODES.map((m) => (
          <button
            key={m}
            type="button"
            className={props.mode === m ? "active" : ""}
            onClick={() => props.onMode(m)}
          >
            {m[0]!.toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>
      <span style={{ color: "var(--ww-muted)", fontSize: 13 }}>{props.workspaceLabel}</span>
      <div className="orbit-actions">
        <button type="button" className="btn" onClick={props.onOpenFolder}>
          打开文件夹
        </button>
        <button type="button" className="btn" onClick={props.onSave}>
          保存
        </button>
        <button type="button" className="btn" onClick={props.onToggleTerminal}>
          终端
        </button>
      </div>
    </header>
  );
}
