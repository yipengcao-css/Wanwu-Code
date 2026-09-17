import type { WanwuBridge } from "../main/preload";
import type { Environment } from "monaco-editor";

declare global {
  interface Window {
    wanwu: WanwuBridge;
  }
  // eslint-disable-next-line no-var
  var MonacoEnvironment: Environment | undefined;
}

export {};
