import { NextResponse } from "next/server";
import { userFacingRemixError } from "@/lib/remix-error";
import { getJobDir, readJobStatus } from "@/lib/remix-job";

type RouteContext = { params: Promise<{ jobId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { jobId } = await context.params;

  let jobDir: string;
  try {
    jobDir = getJobDir(jobId);
  } catch {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  const state = await readJobStatus(jobDir);
  if (!state) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  return NextResponse.json({
    status: state.status,
    error:
      state.status === "failed" && state.error
        ? userFacingRemixError(state.error.slice(0, 500))
        : undefined,
    updatedAt: state.updatedAt,
  });
}
