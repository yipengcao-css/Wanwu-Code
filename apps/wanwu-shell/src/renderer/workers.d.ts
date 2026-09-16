// Ambient declarations for Vite `?worker` imports (Monaco language workers).
// This file intentionally has NO top-level import/export so it stays a global
// script — `declare module` here are true ambient module declarations rather
// than module augmentations, which reliably covers every `?worker` specifier.

declare module "*?worker" {
  const WorkerFactory: { new (): Worker };
  export default WorkerFactory;
}

declare module "monaco-editor/esm/vs/editor/editor.worker?worker" {
  const WorkerFactory: { new (): Worker };
  export default WorkerFactory;
}
declare module "monaco-editor/esm/vs/language/json/json.worker?worker" {
  const WorkerFactory: { new (): Worker };
  export default WorkerFactory;
}
declare module "monaco-editor/esm/vs/language/css/css.worker?worker" {
  const WorkerFactory: { new (): Worker };
  export default WorkerFactory;
}
declare module "monaco-editor/esm/vs/language/html/html.worker?worker" {
  const WorkerFactory: { new (): Worker };
  export default WorkerFactory;
}
declare module "monaco-editor/esm/vs/language/typescript/ts.worker?worker" {
  const WorkerFactory: { new (): Worker };
  export default WorkerFactory;
}
