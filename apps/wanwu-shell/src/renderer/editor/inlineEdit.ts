import * as monaco from "monaco-editor";

/**
 * Ctrl+K inline edit: instruction input (content widget) → provider rewrite
 * of the selection → preview view-zone with Accept/Reject. Nothing mutates
 * the document until Accept (executeEdits creates an undo stop).
 */

type Session = {
  inputWidget: monaco.editor.IContentWidget;
  zoneId?: string;
  dispose: () => void;
};

function el(tag: string, style: Partial<CSSStyleDeclaration>, text?: string): HTMLElement {
  const node = document.createElement(tag);
  Object.assign(node.style, style);
  if (text !== undefined) node.textContent = text;
  return node;
}

export function attachInlineEdit(editor: monaco.editor.IStandaloneCodeEditor): void {
  let session: Session | null = null;

  const close = (): void => {
    if (!session) return;
    if (session.zoneId) {
      editor.changeViewZones((acc) => acc.removeZone(session!.zoneId!));
    }
    editor.removeContentWidget(session.inputWidget);
    session = null;
  };

  editor.addAction({
    id: "wanwu.inlineEdit",
    label: "Wanwu: Inline Edit",
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK],
    run: (ed) => {
      close();
      const model = ed.getModel();
      if (!model) return;
      const sel = ed.getSelection();
      if (!sel) return;
      let range: monaco.Range = sel;
      if (sel.isEmpty()) {
        const line = sel.startLineNumber;
        range = new monaco.Range(line, 1, line, model.getLineMaxColumn(line));
      }

      const dom = el("div", {
        display: "flex",
        gap: "6px",
        padding: "6px",
        background: "#1b1d24",
        border: "1px solid #3a3f4b",
        borderRadius: "6px",
        boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
        zIndex: "100",
      });
      const input = el("input", {
        flex: "1",
        minWidth: "260px",
        background: "transparent",
        border: "none",
        outline: "none",
        color: "#e6e8ee",
        fontSize: "13px",
      }) as HTMLInputElement;
      input.placeholder = "内联编辑指令（Enter 运行 · Esc 取消）";
      dom.appendChild(input);
      const runBtn = el(
        "button",
        { padding: "2px 10px", fontSize: "12px", cursor: "pointer" },
        "运行",
      );
      dom.appendChild(runBtn);

      const widget: monaco.editor.IContentWidget = {
        getId: () => "wanwu.inlineEdit.input",
        getDomNode: () => dom,
        getPosition: () => ({
          position: { lineNumber: range!.endLineNumber, column: range!.endColumn },
          preference: [monaco.editor.ContentWidgetPositionPreference.BELOW],
        }),
      };
      ed.addContentWidget(widget);
      input.focus();

      const submit = async (): Promise<void> => {
        const instruction = input.value.trim();
        if (!instruction) return;
        input.disabled = true;
        runBtn.textContent = "…";
        const selectionText = model.getValueInRange(range!);
        const beforeStart = Math.max(1, range!.startLineNumber - 5);
        const before = model.getValueInRange(
          new monaco.Range(beforeStart, 1, range!.startLineNumber, 1),
        );
        const endLine = Math.min(model.getLineCount(), range!.endLineNumber + 5);
        const after = model.getValueInRange(
          new monaco.Range(range!.endLineNumber, model.getLineMaxColumn(range!.endLineNumber), endLine, model.getLineMaxColumn(endLine)),
        );
        let res: { text: string; error?: string };
        try {
          res = await window.wanwu.ai.inlineEdit({
            instruction,
            selection: selectionText,
            language: model.getLanguageId(),
            path: model.uri.path,
            before,
            after,
          });
        } catch (err) {
          res = { text: "", error: String(err) };
        }
        if (!session) return; // closed while waiting
        if (!res.text) {
          runBtn.textContent = res.error ? `错误: ${res.error.slice(0, 60)}` : "无结果";
          input.disabled = false;
          return;
        }
        showPreview(res.text);
      };

      const showPreview = (newText: string): void => {
        const zoneDom = el("div", {
          background: "rgba(46, 160, 67, 0.12)",
          borderLeft: "3px solid #2ea043",
          padding: "6px 8px",
          fontFamily: "inherit",
          whiteSpace: "pre",
          fontSize: "12px",
          color: "#d6e8dc",
        });
        zoneDom.textContent = newText;
        const row = el("div", { display: "flex", gap: "8px", marginTop: "6px" });
        const accept = el(
          "button",
          { padding: "2px 12px", fontSize: "12px", cursor: "pointer", background: "#2ea043", color: "#fff", border: "none", borderRadius: "4px" },
          "接受",
        );
        const reject = el(
          "button",
          { padding: "2px 12px", fontSize: "12px", cursor: "pointer", background: "transparent", color: "#c9d1d9", border: "1px solid #3a3f4b", borderRadius: "4px" },
          "拒绝",
        );
        row.appendChild(accept);
        row.appendChild(reject);
        zoneDom.appendChild(row);

        const lineCount = newText.split("\n").length + 2;
        ed.changeViewZones((acc) => {
          const id = acc.addZone({
            afterLineNumber: range!.endLineNumber,
            heightInLines: Math.min(lineCount, 30),
            domNode: zoneDom,
          });
          if (session) session.zoneId = id;
        });

        accept.onclick = () => {
          ed.pushUndoStop();
          ed.executeEdits("wanwu-inline-edit", [{ range: range!, text: newText }]);
          ed.pushUndoStop();
          close();
        };
        reject.onclick = () => close();
      };

      input.onkeydown = (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          void submit();
        }
        if (e.key === "Escape") close();
      };
      runBtn.onclick = () => void submit();

      session = {
        inputWidget: widget,
        dispose: close,
      };
    },
  });
}
