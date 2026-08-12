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

  constructor(timeline: ToolTimeline) {
    this.timeline = timeline;
  }

  addChat(line: string): void {
    this.chat.push(line);
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
