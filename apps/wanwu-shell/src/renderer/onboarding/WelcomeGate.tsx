export function WelcomeGate(props: {
  onOpenFolder: () => void;
  onOpenSettings: () => void;
  hasApiKey: boolean | null;
}) {
  return (
    <div className="welcome-gate">
      <div className="welcome-brand">
        <span className="logo-mark welcome-mark" aria-hidden />
        <h1>Wanwu Code</h1>
      </div>
      <p className="welcome-lead">把意图编译成可验证的代码变更 — Agent 优先的桌面工作区。</p>
      <ol className="welcome-steps">
        <li>
          <span className="step-idx">1</span>
          <div>
            <strong>配置模型密钥</strong>
            <p>{props.hasApiKey ? "已检测到本机密钥" : "BYOK：DeepSeek / OpenAI / Anthropic / Ollama"}</p>
          </div>
          <button type="button" className="btn" onClick={props.onOpenSettings}>
            打开设置
          </button>
        </li>
        <li>
          <span className="step-idx">2</span>
          <div>
            <strong>打开工作区（可选）</strong>
            <p>改已有项目就打开文件夹；不选的话，需要写文件时会在桌面自动建 `Wanwu-任务名`</p>
          </div>
          <button type="button" className="btn" onClick={props.onOpenFolder}>
            打开文件夹
          </button>
        </li>
        <li>
          <span className="step-idx">3</span>
          <div>
            <strong>在 Agent Studio 描述任务</strong>
            <p>Ask / Plan / Agent / Verify · Ctrl/Cmd+I 聚焦。无工作区也可直接发送。</p>
          </div>
        </li>
      </ol>
    </div>
  );
}
