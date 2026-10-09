type Formatter = () => Promise<string | null>;

let formatPrimary: Formatter | null = null;

export function setPrimaryFormatter(fn: Formatter | null): void {
  formatPrimary = fn;
}

/** Format the focused editor. Returns the new text, or null when formatting did not run. */
export async function formatPrimaryEditor(): Promise<string | null> {
  if (!formatPrimary) return null;
  try {
    return await formatPrimary();
  } catch {
    return null;
  }
}
