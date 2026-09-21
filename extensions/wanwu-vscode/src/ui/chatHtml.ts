export function chatWebviewHtml(opts: { title: string; compact?: boolean }): string {
  const compact = opts.compact === true;
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${opts.title}</title>
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); margin: 0; padding: ${compact ? "8px" : "12px"}; }
    #log { height: ${compact ? "calc(100vh - 200px)" : "calc(100vh - 180px)"}; overflow: auto; white-space: pre-wrap; border: 1px solid var(--vscode-panel-border); padding: 8px; }
    .row { display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; align-items: center; }
    select, button, textarea { font: inherit; }
    textarea { width: 100%; min-height: ${compact ? "48px" : "64px"}; }
    .user { color: var(--vscode-textLink-foreground); }
    .assistant { color: var(--vscode-foreground); }
    .error { color: var(--vscode-errorForeground); }
    .tool { color: var(--vscode-descriptionForeground); font-family: var(--vscode-editor-font-family); font-size: 12px; }
    .status { opacity: 0.7; font-size: 12px; }
    h3 { margin: 0 0 8px; font-size: ${compact ? "13px" : "16px"}; }
  </style>
</head>
<body>
  <h3>${opts.title}</h3>
  <div class="row">
    <label>Mode
      <select id="mode">
        <option value="ask">Ask</option>
        <option value="plan">Plan</option>
        <option value="agent" selected>Agent</option>
        <option value="verify">Verify</option>
        <option value="debug">Debug</option>
      </select>
    </label>
    <button id="cancel">停止</button>
    <button id="resume">恢复会话</button>
    <span id="status" class="status">idle</span>
  </div>
  <div id="log"></div>
  <textarea id="input" placeholder="描述你的任务…"></textarea>
  <div class="row">
    <button id="send">发送</button>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const log = document.getElementById('log');
    const input = document.getElementById('input');
    const mode = document.getElementById('mode');
    const status = document.getElementById('status');
    function append(cls, text) {
      const div = document.createElement('div');
      div.className = cls;
      div.textContent = text;
      log.appendChild(div);
      log.scrollTop = log.scrollHeight;
    }
    document.getElementById('send').onclick = () => {
      const text = input.value.trim();
      if (!text) return;
      append('user', 'You: ' + text);
      vscode.postMessage({ type: 'send', text, mode: mode.value });
      input.value = '';
    };
    document.getElementById('cancel').onclick = () => vscode.postMessage({ type: 'cancel' });
    document.getElementById('resume').onclick = () => vscode.postMessage({ type: 'resume' });
    mode.onchange = () => vscode.postMessage({ type: 'setMode', mode: mode.value });
    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'assistant') append('assistant', 'Wanwu: ' + msg.text);
      if (msg.type === 'tool') append('tool', '⚙ ' + msg.text);
      if (msg.type === 'error') append('error', 'Error: ' + msg.text);
      if (msg.type === 'status') status.textContent = msg.text;
      if (msg.type === 'user') append('user', 'You: ' + msg.text);
      if (msg.type === 'clear') log.textContent = '';
    });
  </script>
</body>
</html>`;
}
