import { spawn } from "node:child_process";
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

export type PublicRefTunnel = {
  lucaRefBase: string;
  close: () => Promise<void>;
};

/** Serve `public/` + optional set plate; return REMIX_LUCA_REF_BASE for EvoLink. */
export async function startPublicRefTunnel(options?: {
  setPlateLocal?: string;
  setPlateFileName?: string;
}): Promise<PublicRefTunnel> {
  const existing = (process.env.REMIX_LUCA_REF_BASE ?? "").trim();
  if (existing) {
    return {
      lucaRefBase: existing.replace(/\/$/, ""),
      close: async () => undefined,
    };
  }

  const publicDir = path.join(process.cwd(), "public");
  if (options?.setPlateLocal && options.setPlateFileName) {
    const platesDir = path.join(publicDir, "recreate-plates");
    await mkdir(platesDir, { recursive: true });
    await copyFile(
      options.setPlateLocal,
      path.join(platesDir, options.setPlateFileName),
    );
  }

  const port = 3456;
  const httpServer = spawn(
    "python",
    ["-m", "http.server", String(port), "--directory", publicDir],
    { stdio: "ignore", shell: true },
  );

  await new Promise((r) => setTimeout(r, 800));

  const cloudflared = spawn(
    "npx",
    ["--yes", "cloudflared", "tunnel", "--url", `http://127.0.0.1:${port}`],
    { stdio: ["ignore", "pipe", "pipe"], shell: true },
  );

  const origin = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(
      () =>
        reject(
          new Error(
            "cloudflared tunnel URL timeout — run manually: python -m http.server 3456 --directory public, then cloudflared tunnel --url http://127.0.0.1:3456, set REMIX_LUCA_REF_BASE=https://….trycloudflare.com/avatars/luca",
          ),
        ),
      90_000,
    );
    const onData = (chunk: Buffer) => {
      const text = chunk.toString();
      const m = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
      if (m) {
        clearTimeout(timeout);
        resolve(m[0].replace(/\/$/, ""));
      }
    };
    cloudflared.stdout?.on("data", onData);
    cloudflared.stderr?.on("data", onData);
    cloudflared.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });

  const lucaRefBase = `${origin}/avatars/luca`;
  process.env.REMIX_LUCA_REF_BASE = lucaRefBase;
  console.log("Public refs via tunnel:", lucaRefBase);

  return {
    lucaRefBase,
    close: async () => {
      cloudflared.kill("SIGTERM");
      httpServer.kill("SIGTERM");
    },
  };
}
