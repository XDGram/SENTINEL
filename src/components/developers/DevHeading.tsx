"use client";

// The developers page is a server component so it can export metadata, which
// means its heading needs to be its own client piece to follow the language.

import { useT } from "@/lib/client/useT";

export function DevHeading() {
  const tr = useT();
  return (
    <>
      {tr("page.devLine1")} <span className="text-white/70">{tr("page.devLine2")}</span>
    </>
  );
}
