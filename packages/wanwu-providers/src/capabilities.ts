import type { ProviderId } from "@wanwu/config";
import type { ContentPart } from "./content.js";
import { hasImages } from "./content.js";
import { ProviderError } from "./types.js";

export interface ProviderCapabilities {
  imageInput: boolean;
  imageInputModes: ("base64" | "url")[];
  videoInput: "none" | "frames" | "native";
  tools: boolean;
  stream: boolean;
}

const DEFAULTS: Record<ProviderId, ProviderCapabilities> = {
  openai: {
    imageInput: true,
    imageInputModes: ["base64", "url"],
    videoInput: "frames",
    tools: true,
    stream: true,
  },
  anthropic: {
    imageInput: true,
    imageInputModes: ["base64"],
    videoInput: "frames",
    tools: true,
    stream: true,
  },
  xai: {
    imageInput: true,
    imageInputModes: ["base64", "url"],
    videoInput: "frames",
    tools: true,
    stream: true,
  },
  ollama: {
    imageInput: false,
    imageInputModes: [],
    videoInput: "none",
    tools: true,
    stream: true,
  },
  custom: {
    imageInput: false,
    imageInputModes: [],
    videoInput: "none",
    tools: true,
    stream: true,
  },
};

export function getProviderCapabilities(
  providerId: ProviderId,
  _model?: string,
): ProviderCapabilities {
  return DEFAULTS[providerId] ?? DEFAULTS.custom;
}

export function assertMediaSupported(
  providerId: ProviderId,
  parts: ContentPart[],
  model?: string,
): void {
  const caps = getProviderCapabilities(providerId, model);
  if (hasImages(parts) && !caps.imageInput) {
    throw new ProviderError({
      code: "bad_request",
      message: `provider ${providerId} does not support image input`,
      hint: "Remove images or switch to a vision-capable provider/model.",
      provider: providerId,
    });
  }
}
