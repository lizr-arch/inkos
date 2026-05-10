import type { InkosEndpoint } from "../types.js";

export const TRAE: InkosEndpoint = {
  id: "trae",
  label: "Trae (本地)",
  group: "local",
  api: "openai-completions",
  baseUrl: "http://127.0.0.1:37185/v1",
  models: [],
};
