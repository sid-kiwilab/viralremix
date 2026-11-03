import { spawn } from "node:child_process";
import path from "node:path";
import { writeJobStatus } from "@/lib/remix-job";

/** Detached child: EvoLink + Remotion (local dev only). */
export function spawnRemixRenderJob(jobDir: string): Promise<void> {
  const cwd = process.cwd();
  const scriptPath = path.join(cwd, "scripts", "remix-render.ts");
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["tsx", scriptPath, jobDir], {
      cwd,
      detached: true,
      stdio: "ignore",
      env: process.env,
      // Required on Windows so npm's npx.cmd launches from the Next dev server.
      shell: process.platform === "win32",
    });

    child.once("error", (err) => {
      reject(err);
    });

    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

export async function spawnRemixRenderJobOrFail(jobDir: string): Promise<void> {
  try {
    await spawnRemixRenderJob(jobDir);
  } catch {
    await writeJobStatus(jobDir, "failed", "Could not start render worker.");
    throw new Error("Could not start render worker.");
  }
}
