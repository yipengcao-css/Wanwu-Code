export interface CloudJobSpec {
  id: string;
  prompt: string;
  dependsOn?: string[];
}

export interface JobGraphValidation {
  ok: boolean;
  error?: string;
}

/** Validate DAG: no cycles, no missing deps. */
export function validateJobGraph(specs: CloudJobSpec[]): JobGraphValidation {
  const ids = new Set(specs.map((s) => s.id));
  for (const spec of specs) {
    for (const dep of spec.dependsOn ?? []) {
      if (!ids.has(dep)) {
        return { ok: false, error: `unknown dependency: ${dep} for ${spec.id}` };
      }
      if (dep === spec.id) {
        return { ok: false, error: `self dependency: ${spec.id}` };
      }
    }
  }

  // Cycle detection via DFS
  const visiting = new Set<string>();
  const visited = new Set<string>();
  function dfs(id: string): boolean {
    if (visiting.has(id)) return false;
    if (visited.has(id)) return true;
    visiting.add(id);
    const spec = specs.find((s) => s.id === id);
    for (const dep of spec?.dependsOn ?? []) {
      if (!dfs(dep)) return false;
    }
    visiting.delete(id);
    visited.add(id);
    return true;
  }
  for (const spec of specs) {
    if (!dfs(spec.id)) {
      return { ok: false, error: `cycle detected involving ${spec.id}` };
    }
  }
  return { ok: true };
}

/** Return specs in topological order (dependencies first). */
export function topoSortJobs(specs: CloudJobSpec[]): CloudJobSpec[] {
  const byId = new Map(specs.map((s) => [s.id, s]));
  const visited = new Set<string>();
  const out: CloudJobSpec[] = [];

  function visit(id: string): void {
    if (visited.has(id)) return;
    const spec = byId.get(id);
    if (!spec) return;
    for (const dep of spec.dependsOn ?? []) {
      visit(dep);
    }
    visited.add(id);
    out.push(spec);
  }

  for (const spec of specs) {
    visit(spec.id);
  }
  return out;
}
