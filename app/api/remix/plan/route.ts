import { NextResponse } from "next/server";
import { REMIX_PLAN_FETCH_TIMEOUT_MS } from "@/lib/remix-constants";
import {
  REMIX_SCORE_TOO_LOW,
  userFacingRemixError,
} from "@/lib/remix-error";
import { planRemixSpec } from "@/lib/remix-plan";
import { REMIX_MIN_SCORE } from "@/lib/remix-spec";
import { parseAnalysisBody } from "@/lib/remix-validate";

export const maxDuration = 60;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const analysis = parseAnalysisBody(body);
  if (!analysis) {
    return NextResponse.json(
      { error: "Invalid recreatability analysis." },
      { status: 400 },
    );
  }

  if (analysis.overallScore < REMIX_MIN_SCORE) {
    return NextResponse.json({ error: REMIX_SCORE_TOO_LOW }, { status: 422 });
  }

  const timeoutSignal = AbortSignal.timeout(REMIX_PLAN_FETCH_TIMEOUT_MS);
  const signal = request.signal.aborted
    ? request.signal
    : AbortSignal.any([request.signal, timeoutSignal]);

  try {
    if (signal.aborted) {
      return new NextResponse(null, { status: 499 });
    }

    const planned = await planRemixSpec(analysis);
    if (signal.aborted) {
      return new NextResponse(null, { status: 499 });
    }

    if (!planned.ok) {
      return NextResponse.json(
        { error: userFacingRemixError(planned.error) },
        { status: 502 },
      );
    }

    return NextResponse.json(planned.spec);
  } catch (err) {
    if (request.signal.aborted) {
      return new NextResponse(null, { status: 499 });
    }
    if (
      err instanceof DOMException &&
      err.name === "AbortError" &&
      timeoutSignal.aborted
    ) {
      return NextResponse.json(
        { error: "Planning took too long. Try again." },
        { status: 504 },
      );
    }
    const raw = err instanceof Error ? err.message : "Plan failed.";
    return NextResponse.json(
      { error: userFacingRemixError(raw) },
      { status: 502 },
    );
  }
}
