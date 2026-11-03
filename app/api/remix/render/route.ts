import { NextResponse } from "next/server";
import { createRemixJob } from "@/lib/remix-job";
import { userFacingRemixError } from "@/lib/remix-error";
import { spawnRemixRenderJobOrFail } from "@/lib/remix-spawn";
import { parseRemixSpecBody } from "@/lib/remix-validate";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const spec = parseRemixSpecBody(body);
  if (!spec) {
    return NextResponse.json({ error: "Invalid remake plan." }, { status: 400 });
  }

  try {
    const { jobId, jobDir } = await createRemixJob(spec);
    await spawnRemixRenderJobOrFail(jobDir);
    return NextResponse.json({ jobId });
  } catch (err) {
    const raw = err instanceof Error ? err.message : "Could not start render.";
    return NextResponse.json(
      { error: userFacingRemixError(raw) },
      { status: 500 },
    );
  }
}
