import { Command } from "commander";
import http from "node:http";
import { Readable } from "node:stream";
import { loadLLMEnvLayers } from "@actalk/inkos-core";
import { findProjectRoot } from "../utils.js";

type JsonObject = Record<string, unknown>;

function readJson(req: http.IncomingMessage): Promise<JsonObject> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf-8");
        resolve((text ? JSON.parse(text) : {}) as JsonObject);
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function json(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Length", Buffer.byteLength(payload));
  res.end(payload);
}

function pickUpstream(model: string): "deepseek" | "moonshot" {
  const m = model.toLowerCase();
  if (m.includes("kimi") || m.includes("moonshot")) return "moonshot";
  if (m.includes("deepseek")) return "deepseek";
  return "deepseek";
}

function safeParseModelMap(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === "string") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function normalizeModel(model: string, map: Record<string, string>): string {
  if (map[model]) return map[model]!;
  const hit = Object.entries(map).find(([k]) => k.toLowerCase() === model.toLowerCase());
  if (hit) return hit[1];
  if (model === "DeepSeek-V3.2") return "deepseek-v4-pro";
  if (model === "Kimi-K2.5") return "kimi-k2.5";
  return model;
}

function baseJoin(baseUrl: string, path: string): string {
  const b = baseUrl.replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  if (b.endsWith("/v1") || b.endsWith("/v1beta") || b.endsWith("/v1beta1")) return `${b}${p}`;
  return `${b}${p}`;
}

async function proxyStream(
  upstreamUrl: string,
  headers: Record<string, string>,
  body: JsonObject,
  res: http.ServerResponse,
): Promise<void> {
  const upstreamRes = await fetch(upstreamUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

  res.statusCode = upstreamRes.status;
  res.setHeader("Content-Type", upstreamRes.headers.get("content-type") ?? "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  if (!upstreamRes.body) {
    const text = await upstreamRes.text();
    res.end(text);
    return;
  }

  const nodeStream = Readable.fromWeb(upstreamRes.body as unknown as ReadableStream<Uint8Array>);
  nodeStream.pipe(res);
}

async function proxyJson(
  upstreamUrl: string,
  headers: Record<string, string>,
  body: JsonObject,
  res: http.ServerResponse,
): Promise<void> {
  const upstreamRes = await fetch(upstreamUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const text = await upstreamRes.text();
  res.statusCode = upstreamRes.status;
  res.setHeader("Content-Type", upstreamRes.headers.get("content-type") ?? "application/json; charset=utf-8");
  res.end(text);
}

export const bridgeCommand = new Command("bridge")
  .description("Run a local OpenAI-compatible gateway for InkOS")
  .option("--host <host>", "Listen host", "127.0.0.1")
  .option("--port <port>", "Listen port", "37185")
  .action(async (opts: { host: string; port: string }) => {
    const root = findProjectRoot();
    await loadLLMEnvLayers(root);

    const modelMap = safeParseModelMap(process.env.TRAE_BRIDGE_MODEL_MAP);
    const deepseekBaseUrl = process.env.TRAE_BRIDGE_DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
    const moonshotBaseUrl = process.env.TRAE_BRIDGE_MOONSHOT_BASE_URL ?? "https://api.moonshot.cn/v1";
    const deepseekKey = process.env.TRAE_BRIDGE_DEEPSEEK_API_KEY ?? process.env.DEEPSEEK_API_KEY ?? process.env.INKOS_LLM_API_KEY ?? "";
    const moonshotKey = process.env.TRAE_BRIDGE_MOONSHOT_API_KEY ?? process.env.MOONSHOT_API_KEY ?? process.env.INKOS_LLM_API_KEY ?? "";

    const models = [
      { id: "Kimi-K2.5" },
      { id: "DeepSeek-V3.2" },
    ];

    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
        const path = url.pathname;

        if (req.method === "GET" && (path === "/v1/models" || path === "/models")) {
          json(res, 200, { object: "list", data: models.map((m) => ({ object: "model", owned_by: "trae-bridge", ...m })) });
          return;
        }

        if (req.method === "POST" && (path === "/v1/chat/completions" || path === "/chat/completions")) {
          const payload = await readJson(req);
          const rawModel = String(payload.model ?? "");
          const mappedModel = normalizeModel(rawModel, modelMap);
          const upstream = pickUpstream(rawModel || mappedModel);
          const upstreamBase = upstream === "moonshot" ? moonshotBaseUrl : deepseekBaseUrl;
          const key = upstream === "moonshot" ? moonshotKey : deepseekKey;
          const upstreamUrl = baseJoin(upstreamBase, "/chat/completions");

          const forward: JsonObject = { ...payload, model: mappedModel };
          const stream = Boolean(forward.stream);

          if (!key) {
            json(res, 401, { error: { message: `Missing API key for upstream: ${upstream}` } });
            return;
          }

          const headers = { Authorization: `Bearer ${key}` };
          if (stream) await proxyStream(upstreamUrl, headers, forward, res);
          else await proxyJson(upstreamUrl, headers, forward, res);
          return;
        }

        json(res, 404, { error: { message: "Not Found" } });
      } catch (e) {
        json(res, 500, { error: { message: e instanceof Error ? e.message : String(e) } });
      }
    });

    server.listen(Number(opts.port), opts.host, () => {
      process.stdout.write(`Trae Bridge listening on http://${opts.host}:${opts.port}/v1\n`);
    });
  });

