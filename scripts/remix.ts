import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadLocalEnv } from "@/lib/load-env";
import { planRemixSpec } from "@/lib/remix-plan";
import {
  loadLatestEligibleAnalyzeRun,
  parseAnalysisJson,
} from "@/lib/remix-analyze-load";
import { renderRemixFromSpec } from "@/lib/remix-render";
import { REMIX_MIN_SCORE } from "@/lib/remix-spec";
import type { RecreatabilityAnalysis } from "@/lib/recreatability";

loadLocalEnv();

const OUT_DIR = path.join(process.cwd(), "out");
const SPEC_PATH = path.join(OUT_DIR, "remix-spec.json");
const OUTPUT_MP4 = path.join(OUT_DIR, "remix.mp4");

async function readAnalysisFromArg(arg: string): Promise<RecreatabilityAnalysis> {
  const filePath = path.resolve(arg);
  const { readFile } = await import("node:fs/promises");
  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  const analysis = parseAnalysisJson(parsed);
  if (!analysis) {
    throw new Error(
      `Invalid analysis JSON: ${filePath} (expected RecreatabilityAnalysis or Neon row with "result").`,
    );
  }
  return analysis;
}

async function loadAnalysis(): Promise<RecreatabilityAnalysis> {
  const arg = process.argv[2];
  if (arg && !arg.startsWith("-")) {
    return readAnalysisFromArg(arg);
  }

  const loaded = await loadLatestEligibleAnalyzeRun();
  if (!loaded) {
    throw new Error(
      `No eligible analyze_runs row (prompt_version 2, score >= ${REMIX_MIN_SCORE}). Pass a JSON file path or re-analyze.`,
    );
  }
  console.log(
    `Using Neon analyze run (score ${loaded.overallScore})${loaded.sourceUrl ? `: ${loaded.sourceUrl}` : ""}`,
  );
  return loaded.analysis;
}

async function main() {
  const analysis = await loadAnalysis();
  if (analysis.overallScore < REMIX_MIN_SCORE) {
    throw new Error(
      `Score ${analysis.overallScore} is below remix gate (${REMIX_MIN_SCORE}).`,
    );
  }

  console.log("Planning remix spec (OpenRouter)…");
  const planned = await planRemixSpec(analysis);
  if (!planned.ok) {
    throw new Error(planned.error);
  }
  const spec = planned.spec;

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(SPEC_PATH, `${JSON.stringify(spec, null, 2)}\n`, "utf8");
  console.log(`Wrote ${SPEC_PATH}`);

  console.log("Generating clips + VO (EvoLink)…");
  await renderRemixFromSpec({
    spec,
    workDir: OUT_DIR,
    assetsSubdir: "remix-assets",
    outputFileName: "remix.mp4",
    onPhase: async (phase) => {
      console.log(phase === "generating" ? "Generating…" : "Rendering MP4…");
    },
  });

  console.log(`Done: ${OUTPUT_MP4}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
