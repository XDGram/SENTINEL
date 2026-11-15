import { NextResponse } from "next/server";
import { listThreats } from "@/lib/store";
import type { ThreatsResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const data: ThreatsResponse = await listThreats();
  return NextResponse.json(data);
}
