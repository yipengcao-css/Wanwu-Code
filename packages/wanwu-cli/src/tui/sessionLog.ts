export interface SessionTurn {
  id: number;
  ts: string;
  mode: string;
  user: string;
  assistant?: string;
  tools: Array<{ title: string; status: string }>;
}

export class SessionLog {
  private readonly turns: SessionTurn[] = [];
  private nextId = 1;

  add(turn: Omit<SessionTurn, "id" | "ts">): SessionTurn {
    const full: SessionTurn = {
      ...turn,
      id: this.nextId++,
      ts: new Date().toISOString(),
    };
    this.turns.push(full);
    return full;
  }

  list(limit = 20): SessionTurn[] {
    return this.turns.slice(-limit);
  }

  get(id: number): SessionTurn | undefined {
    return this.turns.find((t) => t.id === id);
  }

  clear(): void {
    this.turns.length = 0;
  }
}
