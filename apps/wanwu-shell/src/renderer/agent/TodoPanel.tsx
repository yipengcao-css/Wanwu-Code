export type TodoItemView = {
  content: string;
  status: "pending" | "in_progress" | "completed";
};

const ICON: Record<TodoItemView["status"], string> = {
  pending: "○",
  in_progress: "◐",
  completed: "●",
};

export function TodoPanel(props: { items: TodoItemView[] }) {
  if (!props.items.length) return null;
  const done = props.items.filter((i) => i.status === "completed").length;
  return (
    <div className="todo-panel" aria-label="Agent 任务清单">
      <div className="todo-head">
        <span>任务</span>
        <span className="todo-count">
          {done}/{props.items.length}
        </span>
      </div>
      <ul className="todo-list">
        {props.items.map((item, i) => (
          <li
            key={`${i}-${item.content.slice(0, 24)}`}
            className={`todo-item status-${item.status}`}
          >
            <span aria-hidden>{ICON[item.status]}</span>
            <span>{item.content}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
