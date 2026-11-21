/** Backend HTTP client — GET/POST to Python backend. */
import http from "http";

export const BACKEND_PORT = parseInt(
  process.env.LUMINA_BACKEND_PORT || "8765",
  10,
);

function parseJson(body: string, endpoint: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`Bad JSON from ${endpoint}`);
  }
}

function collect(res: import("http").IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = "";
    res.on("data", (chunk) => (body += chunk));
    res.on("end", () => resolve(body));
  });
}

export function apiGet(endpoint: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = http.get(
      `http://127.0.0.1:${BACKEND_PORT}${endpoint}`,
      async (res) => {
        const body = await collect(res);
        try {
          resolve(parseJson(body, endpoint));
        } catch (e) {
          reject(e);
        }
      },
    );
    req.on("error", reject);
  });
}

export function apiPost(endpoint: string, body: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      `http://127.0.0.1:${BACKEND_PORT}${endpoint}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
      },
      async (res) => {
        const text = await collect(res);
        try {
          resolve(parseJson(text, endpoint));
        } catch (e) {
          reject(e);
        }
      },
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

export function apiPostStream(
  endpoint: string,
  body: unknown,
  onChunk?: (data: unknown) => void,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      `http://127.0.0.1:${BACKEND_PORT}${endpoint}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
      },
      (res) => {
        let buffer = "";
        let finalResult: unknown = null;
        let streamError: string | null = null;

        const processLine = (line: string) => {
          const trimmed = line.trim();
          if (!trimmed) return;
          try {
            const parsed = JSON.parse(trimmed) as {
              type?: string;
              detail?: string;
              [key: string]: unknown;
            };
            if (parsed.type === "progress") {
              onChunk?.(parsed);
            } else if (parsed.type === "done") {
              finalResult = parsed;
            } else if (parsed.type === "error") {
              streamError = parsed.detail || "Stream error";
            }
          } catch {
            /* ignore partial/invalid json line */
          }
        };

        res.on("data", (chunk: Buffer) => {
          buffer += chunk.toString("utf-8");
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            processLine(line);
          }
        });

        res.on("end", () => {
          if (buffer.trim()) {
            processLine(buffer);
          }

          if (streamError) {
            reject(new Error(streamError));
          } else if (res.statusCode && res.statusCode >= 400) {
            let msg = `HTTP ${res.statusCode} from ${endpoint}`;
            try {
              const errObj = JSON.parse(buffer.trim()) as { detail?: string };
              if (errObj && errObj.detail) msg = errObj.detail;
            } catch {
              /* ignore */
            }
            reject(new Error(msg));
          } else {
            resolve(finalResult);
          }
        });
      },
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}
