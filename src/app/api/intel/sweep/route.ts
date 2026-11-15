import { NextResponse } from "next/server";
import { runSweep } from "@/lib/intel/sweep";
import { listSweeps } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Run a sweep. Called by Vercel Cron (Authorization: Bearer CRON_SECRET). */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const url = new URL(req.url);

  // Without the secret, only list past sweeps (so the public can't trigger work).
  if (!secret || auth !== `Bearer ${secret}`) {
    if (url.searchParams.get("run") === "1") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ sweeps: await listSweeps() });
  }
  const sweep = await runSweep();
  return NextResponse.json({ sweep });
}
