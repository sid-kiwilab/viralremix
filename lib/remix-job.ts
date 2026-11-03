import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { RemixJobStatus } from "@/lib/remix-constants";
import type { RemixSpec } from "@/lib/remix-spec";

export type { RemixJobStatus };

export type RemixJobState = {
  status: RemixJobStatus;
  error?: string;
  updatedAt: string;
};

const JOB_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertValidJobId(jobId: string): void {
  if (!JOB_ID_RE.test(jobId)) {
    throw new Error("Invalid job id.");
  }
}

export function getRemixJobsRoot(): string {
  return path.join(os.tmpdir(), "viralremix");
}

export function getJobDir(jobId: string): string {
  assertValidJobId(jobId);
  return path.join(getRemixJobsRoot(), `remix-${jobId}`);
}

export function getJobSpecPath(jobDir: string): string {
  return path.join(jobDir, "spec.json");
}

export function getJobStatusPath(jobDir: string): string {
  return path.join(jobDir, "status.json");
}

export function getJobAssetsDir(jobDir: string): string {
  return path.join(jobDir, "assets");
}

export function getJobOutputPath(jobDir: string): string {
  return path.join(jobDir, "remix.mp4");
}

export async function writeJobStatus(
  jobDir: string,
  status: RemixJobStatus,
  error?: string,
): Promise<void> {
  const state: RemixJobState = {
    status,
    updatedAt: new Date().toISOString(),
    ...(error ? { error } : {}),
  };
  await writeFile(getJobStatusPath(jobDir), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export async function readJobStatus(jobDir: string): Promise<RemixJobState | null> {
  try {
    const raw = await readFile(getJobStatusPath(jobDir), "utf8");
    const parsed = JSON.parse(raw) as RemixJobState;
    if (!parsed?.status) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function createRemixJob(spec: RemixSpec): Promise<{
  jobId: string;
  jobDir: string;
}> {
  const jobId = randomUUID();
  const jobDir = getJobDir(jobId);
  await mkdir(jobDir, { recursive: true });
  await mkdir(getJobAssetsDir(jobDir), { recursive: true });
  await writeFile(getJobSpecPath(jobDir), `${JSON.stringify(spec, null, 2)}\n`, "utf8");
  await writeJobStatus(jobDir, "queued");
  return { jobId, jobDir };
}
