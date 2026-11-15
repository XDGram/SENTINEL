import { NextResponse } from "next/server";
import { servAvailable, SERV_MODEL } from "@/lib/serv";
import { reppoAvailable } from "@/lib/reppo";
import { storeKind } from "@/lib/store";
import { servBudgetUsed } from "@/lib/guard";
import { webSearchProvider } from "@/lib/intel/web";

export const dynamic = "force-dynamic";

/** Which real services are connected. Never returns key values. */
export async function GET() {
  return NextResponse.json({
    serv: servAvailable(),
    servModel: SERV_MODEL,
    reppo: reppoAvailable(),
    store: storeKind(),
    webSearch: webSearchProvider() ?? "off",
    servBudget: servBudgetUsed(),
  });
}
