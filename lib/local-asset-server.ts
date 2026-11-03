import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";

const MIME: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
  ".webm": "video/webm",
};

export type LocalAssetServer = {
  baseUrl: string;
  close: () => Promise<void>;
};

/** Serves files from one directory over HTTP (Remotion on Windows needs http(s) src URLs). */
export async function startLocalAssetServer(
  rootDir: string,
): Promise<LocalAssetServer> {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const name = path.basename(decodeURIComponent(url.pathname));
      if (!name || name.includes("..")) {
        res.statusCode = 400;
        res.end("Bad request");
        return;
      }
      const filePath = path.join(rootDir, name);
      if (!existsSync(filePath)) {
        res.statusCode = 404;
        res.end("Not found");
        return;
      }
      const info = await stat(filePath);
      if (!info.isFile()) {
        res.statusCode = 404;
        res.end("Not found");
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.setHeader("Content-Type", MIME[ext] ?? "application/octet-stream");
      res.setHeader("Content-Length", info.size);
      createReadStream(filePath).pipe(res);
    } catch {
      res.statusCode = 500;
      res.end("Error");
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const addr = server.address();
  if (!addr || typeof addr === "string") {
    throw new Error("Could not start local asset server.");
  }

  return {
    baseUrl: `http://127.0.0.1:${addr.port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
