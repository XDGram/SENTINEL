"use client";

import { cn } from "@/lib/cn";

/** Card with a cursor-following accent light and a gentle lift (see .uv-spot / .uv-lift). */
export function Spotlight({ className, children, lift = true, ...rest }: React.HTMLAttributes<HTMLDivElement> & { lift?: boolean }) {
  return (
    <div
      {...rest}
      className={cn("uv-spot", lift && "uv-lift", className)}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
        e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
      }}
    >
      {children}
    </div>
  );
}
