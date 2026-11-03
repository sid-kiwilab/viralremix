import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { NextResponse } from "next/server";
import { getJobDir, getJobOutputPath, readJobStatus } from "@/lib/remix-job";

type RouteContext = { params: Promise<{ jobId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { jobId } = await context.params;

  let jobDir: string;
  try {
    jobDir = getJobDir(jobId);
  } catch {
    return NextResponse.json({ error: "Video not ready." }, { status: 404 });
  }

  const state = await readJobStatus(jobDir);
  if (!state || state.status !== "done") {
    return NextResponse.json({ error: "Video not ready." }, { status: 404 });
  }

  const outputPath = getJobOutputPath(jobDir);
  let fileSize: number;
  try {
    const info = await stat(outputPath);
    if (!info.isFile() || info.size === 0) {
      return NextResponse.json({ error: "Video not ready." }, { status: 404 });
    }
    fileSize = info.size;
  } catch {
    return NextResponse.json({ error: "Video not ready." }, { status: 404 });
  }

  const stream = createReadStream(outputPath);
  return new NextResponse(stream as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(fileSize),
      "Cache-Control": "private, no-store",
    },
  });
}
