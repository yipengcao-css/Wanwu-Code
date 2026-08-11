export type JsonRpc = Record<string, unknown>;

export function send(msg: JsonRpc): void {
  process.stdout.write(`${JSON.stringify(msg)}\n`);
}

export function sendResult(id: string | number, result: unknown): void {
  send({ jsonrpc: "2.0", id, result });
}

export function sendError(id: string | number, code: number, message: string): void {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

export function sessionUpdate(sessionId: string, update: Record<string, unknown>): void {
  send({
    jsonrpc: "2.0",
    method: "session/update",
    params: { sessionId, update },
  });
}
