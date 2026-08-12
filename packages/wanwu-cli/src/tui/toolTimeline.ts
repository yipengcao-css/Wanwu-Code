const STATUS_ICON: Record<string, string> = {
  pending: "⟳",
  in_progress: "▶",
  completed: "✓",
  failed: "✗",
};

export function formatToolLine(
  toolCallId: string,
  title: string,
  status: string,
): string {
  const icon = STATUS_ICON[status] ?? "•";
  const color =
    status === "completed"
      ? "\x1b[32m"
      : status === "failed"
        ? "\x1b[31m"
        : "\x1b[33m";
  return `${color}${icon}\x1b[0m \x1b[90m${title}\x1b[0m \x1b[90m(${toolCallId})\x1b[0m`;
}

export class ToolTimeline {
  private readonly lines = new Map<string, string>();

  upsert(toolCallId: string, title: string, status: string): string {
    const line = formatToolLine(toolCallId, title, status);
    this.lines.set(toolCallId, line);
    return line;
  }

  list(): string[] {
    return [...this.lines.values()];
  }

  clear(): void {
    this.lines.clear();
  }
}
