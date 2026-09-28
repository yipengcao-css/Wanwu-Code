import * as monaco from "monaco-editor";
import type { DiffHunk } from "../agent/diffHunks";

/** Inline accept/reject widgets for the file currently under review. */
export function mountHunkReview(
  editor: monaco.editor.IStandaloneCodeEditor,
  hunks: DiffHunk[],
  accepted: Record<string, boolean>,
  onToggle: (id: string, accept: boolean) => void,
): () => void {
  const shown = hunks.slice(0, 12);
  const decorations = editor.createDecorationsCollection(
    shown
      .filter((h) => accepted[h.id] !== false && h.before.length > 0)
      .map((h) => ({
        range: new monaco.Range(
          h.startLine,
          1,
          h.startLine + Math.max(h.before.length - 1, 0),
          1,
        ),
        options: {
          isWholeLine: true,
          className: "hunk-old-line",
          overviewRuler: {
            color: "#f25f7c",
            position: monaco.editor.OverviewRulerLane.Left,
          },
        },
      })),
  );
  const widgets: monaco.editor.IContentWidget[] = [];
  const lineCount = editor.getModel()?.getLineCount() ?? 1;
  for (const hunk of shown) {
    const dom = document.createElement("div");
    dom.className = `hunk-zone${accepted[hunk.id] === false ? " is-off" : ""}`;
    const pre = document.createElement("pre");
    pre.textContent = hunk.after.length ? hunk.after.join("\n") : "（删除这些行）";
    const row = document.createElement("div");
    row.className = "hunk-zone-actions";
    const acceptBtn = document.createElement("button");
    acceptBtn.type = "button";
    acceptBtn.className = "btn";
    acceptBtn.textContent = accepted[hunk.id] === false ? "接受" : "已接受";
    acceptBtn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onToggle(hunk.id, true);
    });
    const rejectBtn = document.createElement("button");
    rejectBtn.type = "button";
    rejectBtn.className = "btn";
    rejectBtn.textContent = accepted[hunk.id] === false ? "已拒绝" : "拒绝";
    rejectBtn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onToggle(hunk.id, false);
    });
    row.append(acceptBtn, rejectBtn);
    dom.append(pre, row);
    const line = Math.min(Math.max(hunk.startLine, 1), lineCount);
    const widget: monaco.editor.IContentWidget = {
      getId: () => `wanwu-hunk-${hunk.id}`,
      getDomNode: () => dom,
      getPosition: () => ({
        position: { lineNumber: line, column: 1 },
        preference: [monaco.editor.ContentWidgetPositionPreference.BELOW],
      }),
    };
    editor.addContentWidget(widget);
    widgets.push(widget);
  }
  return () => {
    decorations.clear();
    for (const widget of widgets) editor.removeContentWidget(widget);
  };
}
