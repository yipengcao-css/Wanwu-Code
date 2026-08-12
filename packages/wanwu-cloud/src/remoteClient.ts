import type { CloudClient, CloudTask, CloudTaskStatus } from "./types.js";

export interface RemoteTaskLinks {
  status?: string;
  logs?: string;
  diff?: string;
}

export interface RemoteTask extends CloudTask {
  links?: RemoteTaskLinks;
  exitCode?: number;
  error?: string;
}

export interface HttpCloudClientOptions {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
}

/**
 * HTTP client for a remote wanwu cloud runner.
 * Token comes from WANWU_CLOUD_TOKEN; never logged.
 */
export class HttpCloudClient implements CloudClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: HttpCloudClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.token = opts.token;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private headers(): Record<string, string> {
    return {
      authorization: `Bearer ${this.token}`,
      "content-type": "application/json",
    };
  }

  async submit(prompt: string): Promise<CloudTask> {
    const res = await this.fetchImpl(`${this.baseUrl}/v1/tasks`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ prompt }),
    });
    if (!res.ok) {
      throw new Error(`remote submit failed: ${res.status}`);
    }
    return (await res.json()) as CloudTask;
  }

  async get(id: string): Promise<CloudTask | undefined> {
    const res = await this.fetchImpl(`${this.baseUrl}/v1/tasks/${id}`, {
      headers: this.headers(),
    });
    if (res.status === 404) return undefined;
    if (!res.ok) {
      throw new Error(`remote status failed: ${res.status}`);
    }
    return (await res.json()) as CloudTask;
  }

  async list(): Promise<CloudTask[]> {
    const res = await this.fetchImpl(`${this.baseUrl}/v1/tasks`, {
      headers: this.headers(),
    });
    if (!res.ok) {
      throw new Error(`remote list failed: ${res.status}`);
    }
    return (await res.json()) as CloudTask[];
  }

  async logs(id: string): Promise<string> {
    const res = await this.fetchImpl(`${this.baseUrl}/v1/tasks/${id}/logs`, {
      headers: this.headers(),
    });
    if (!res.ok) {
      throw new Error(`remote logs failed: ${res.status}`);
    }
    return res.text();
  }

  async diff(id: string): Promise<string> {
    const res = await this.fetchImpl(`${this.baseUrl}/v1/tasks/${id}/diff`, {
      headers: this.headers(),
    });
    if (!res.ok) {
      throw new Error(`remote diff failed: ${res.status}`);
    }
    return res.text();
  }
}

export function isTerminalStatus(status: CloudTaskStatus): boolean {
  return status === "succeeded" || status === "failed" || status === "cancelled";
}
