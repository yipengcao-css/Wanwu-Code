import { describe, expect, it } from "vitest";
import { topoSortJobs, validateJobGraph } from "./jobGraph.js";

describe("jobGraph", () => {
  it("validates acyclic graph", () => {
    const specs = [
      { id: "a", prompt: "a" },
      { id: "b", prompt: "b", dependsOn: ["a"] },
    ];
    expect(validateJobGraph(specs).ok).toBe(true);
  });

  it("rejects cycle", () => {
    const specs = [
      { id: "a", prompt: "a", dependsOn: ["b"] },
      { id: "b", prompt: "b", dependsOn: ["a"] },
    ];
    expect(validateJobGraph(specs).ok).toBe(false);
  });

  it("rejects missing dep", () => {
    const specs = [{ id: "a", prompt: "a", dependsOn: ["missing"] }];
    expect(validateJobGraph(specs).ok).toBe(false);
  });

  it("topo sorts dependencies first", () => {
    const specs = [
      { id: "b", prompt: "b", dependsOn: ["a"] },
      { id: "a", prompt: "a" },
      { id: "c", prompt: "c", dependsOn: ["b"] },
    ];
    const sorted = topoSortJobs(specs);
    expect(sorted.map((s) => s.id)).toEqual(["a", "b", "c"]);
  });
});
