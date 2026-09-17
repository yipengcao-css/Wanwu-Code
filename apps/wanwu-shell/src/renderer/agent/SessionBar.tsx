export function SessionBar(props: {
  sessions: { id: string; title: string }[];
  activeId: string;
  onSwitch: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="session-bar">
      <select
        className="session-select"
        value={props.activeId}
        onChange={(e) => props.onSwitch(e.target.value)}
        title="切换会话"
      >
        {props.sessions.map((s) => (
          <option key={s.id} value={s.id}>
            {s.title}
          </option>
        ))}
      </select>
      <button type="button" title="新建会话" onClick={props.onNew}>
        ＋
      </button>
      <button
        type="button"
        title="删除会话"
        onClick={() => props.onDelete(props.activeId)}
        disabled={props.sessions.length <= 1}
      >
        🗑
      </button>
    </div>
  );
}
