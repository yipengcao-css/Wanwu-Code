import { describe, expect, it } from "vitest";
import { SessionView } from "./sessionView.js";
import { ToolTimeline } from "./toolTimeline.js";

describe("SessionView.appendChat", () => {
  it("starts a line then concatenates deltas", () => {
    const view = new SessionView(new ToolTimeline());
    view.appendChat("Hel");
    view.appendChat("lo");
    view.appendChat(" world");
    expect(view.getState().chat).toEqual(["Hello world"]);
  });

  it("addChat still starts a new line", () => {
    const view = new SessionView(new ToolTimeline());
    view.addChat("one");
    view.addChat("two");
    expect(view.getState().chat).toEqual(["one", "two"]);
  });

  it("starts a new stream after a tool line", () => {
    const view = new SessionView(new ToolTimeline());
    view.appendChat("hello");
    view.addChat("[tool] Read");
    view.appendChat("after");
    expect(view.getState().chat).toEqual(["hello", "[tool] Read", "after"]);
  });
});
