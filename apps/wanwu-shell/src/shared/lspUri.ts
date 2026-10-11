/** file:// URI (or absolute path) → workspace-relative path, or null if it leaves the root. */
export function relFromFileUri(uri: string, workspaceRoot: string): string | null {
  if (!uri || !workspaceRoot) return null;
  let abs = uri;
  if (uri.startsWith("file:")) {
    try {
      const parsed = new URL(uri);
      abs = decodeURIComponent(parsed.pathname);
      if (/^\/[A-Za-z]:\//.test(abs)) abs = abs.slice(1);
    } catch {
      return null;
    }
  }
  const norm = abs.replace(/\\/g, "/");
  const root = workspaceRoot.replace(/\\/g, "/").replace(/\/+$/, "");
  if (norm !== root && !norm.startsWith(`${root}/`)) return null;
  const rel = norm === root ? "" : norm.slice(root.length + 1);
  if (!rel || rel.split("/").includes("..")) return null;
  return rel;
}

/**
 * Editor models are `Uri.parse(rel)`, which Monaco stores as `file:///` + rel.
 * A real `file://` URI under the workspace wins; otherwise use the model path.
 */
export function relFromEditorResource(uri: string, path: string, workspaceRoot: string): string | null {
  const fromFile = relFromFileUri(uri, workspaceRoot);
  if (fromFile) return fromFile;
  const rel = path.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!rel || rel.split("/").includes("..")) return null;
  return rel;
}
