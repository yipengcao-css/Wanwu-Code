import type { ProviderId, WanwuConfig } from "@wanwu/config";

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ChatResponse {
  text: string;
  provider: ProviderId;
  model: string;
  raw?: unknown;
}

export type ProviderErrorCode =
  | "auth"
  | "rate_limit"
  | "network"
  | "bad_request"
  | "unreachable"
  | "config"
  | "unknown";

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly provider: ProviderId;
  readonly hint: string;
  readonly status?: number;

  constructor(opts: {
    code: ProviderErrorCode;
    message: string;
    hint: string;
    provider: ProviderId;
    status?: number;
  }) {
    super(opts.message);
    this.name = "ProviderError";
    this.code = opts.code;
    this.hint = opts.hint;
    this.provider = opts.provider;
    this.status = opts.status;
  }
}

export interface ResolvedProvider {
  id: ProviderId;
  model: string;
  apiKey?: string;
  baseUrl: string;
  kind: "openai-compat" | "anthropic";
}

export type FetchLike = typeof fetch;

export interface CompleteChatOptions {
  config: WanwuConfig;
  request: ChatRequest;
  /** Override active provider for matrix runs */
  providerId?: ProviderId;
  fetchImpl?: FetchLike;
  env?: NodeJS.ProcessEnv;
}
