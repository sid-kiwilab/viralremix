import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadLocalEnv } from "@/lib/load-env";
import {
  getJobOutputPath,
  getJobSpecPath,
  writeJobStatus,
} from "@/lib/remix-job";
import { renderRemixFromSpec } from "@/lib/remix-render";
import { parseRemixSpec } from "@/lib/remix-spec";

loadLocalEnv();

async function main() {
  const jobDir = process.argv[2];
  if (!jobDir) {
    throw new Error("Usage: tsx scripts/remix-render.ts <jobDir>");
  }

  const specRaw = await readFile(getJobSpecPath(jobDir), "utf8");
  const spec = parseRemixSpec(specRaw);
  if (!spec) {
    await writeJobStatus(jobDir, "failed", "Invalid job spec.");
    process.exit(1);
  }

  try {
    await writeJobStatus(jobDir, "generating");
    await renderRemixFromSpec({
      spec,
      workDir: jobDir,
      projectRoot: process.cwd(),
      outputFileName: path.basename(getJobOutputPath(jobDir)),
      onPhase: async (phase) => {
        if (phase === "rendering") {
          await writeJobStatus(jobDir, "rendering");
        }
      },
    });
    await writeJobStatus(jobDir, "done");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Render failed.";
    await writeJobStatus(jobDir, "failed", message);
    process.exit(1);
  }
}

void main();
