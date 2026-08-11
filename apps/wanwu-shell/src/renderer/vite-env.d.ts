import type { WanwuBridge } from "../main/preload";
import type { Environment } from "monaco-editor";

declare global {
  interface Window {
    wanwu: WanwuBridge;
  }
  // eslint-disable-next-line no-var
  var MonacoEnvironment: Environment | undefined;
}

declare module "*?worker" {
  const WorkerFactory: {
    new (): Worker;
  };
  export default WorkerFactory;
}

export {};
