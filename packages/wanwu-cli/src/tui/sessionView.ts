import type { ToolTimeline } from "./toolTimeline.js";

export interface SessionViewState {
  chat: string[];
  tools: string[];
  status: string;
}

export class SessionView {
  private chat: string[] = [];
  private readonly timeline: ToolTimeline;
  private status = "";
  /** True while the last chat line is an in-progress assistant stream. */
  private streaming = false;

  constructor(timeline: ToolTimeline) {
    this.timeline = timeline;
  }

  addChat(line: string): void {
    this.streaming = false;
    this.chat.push(line);
  }

  /** Append a streaming text delta onto the last assistant line (or start one). */
  appendChat(delta: string): void {
    if (!delta) return;
    if (this.streaming && this.chat.length > 0) {
      this.chat[this.chat.length - 1] += delta;
      return;
    }
    this.chat.push(delta);
    this.streaming = true;
  }

  setStatus(status: string): void {
    this.status = status;
  }

  getState(): SessionViewState {
    return {
      chat: this.chat.slice(),
      tools: this.timeline.list(),
      status: this.status,
    };
  }

  clearChat(): void {
    this.chat = [];
  }
}
