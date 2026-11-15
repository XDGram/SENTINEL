// React wrappers for elements adapted from Uiverse.io (MIT). Styles live in globals.css (.uv-*).
import Link from "next/link";
import { forwardRef } from "react";
import { cn } from "@/lib/cn";

const ArrowCircle = ({ stroke }: { stroke: string }) => (
  <svg viewBox="0 0 74 74" fill="none" aria-hidden>
    <circle cx="37" cy="37" r="35.5" stroke={stroke} strokeWidth="3" />
    <path
      d="M25 35.5C24.17 35.5 23.5 36.17 23.5 37C23.5 37.83 24.17 38.5 25 38.5V35.5ZM49.06 38.06C49.65 37.47 49.65 36.53 49.06 35.94L39.51 26.39C38.93 25.81 37.98 25.81 37.39 26.39C36.81 26.98 36.81 27.93 37.39 28.51L45.88 37L37.39 45.49C36.81 46.07 36.81 47.02 37.39 47.61C37.98 48.19 38.93 48.19 39.51 47.61L49.06 38.06ZM25 38.5H48V35.5H25V38.5Z"
      fill={stroke}
    />
  </svg>
);

type Tone = "dark" | "light" | "accent";
const TONE: Record<Tone, { cls: string; stroke: string }> = {
  dark: { cls: "bg-ink text-white hover:bg-ink/90", stroke: "#ffffff" },
  light: { cls: "bg-white text-ink hover:bg-white/90", stroke: "#1e2a28" },
  accent: { cls: "bg-accent text-ink hover:bg-[#dd8fc7]", stroke: "#1e2a28" },
};

/** Arrow CTA pill (Uiverse: alexmaracinaru/perfect-panda-77). */
export const CtaButton = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone }>(
  function CtaButton({ tone = "dark", className, children, ...props }, ref) {
    const t = TONE[tone];
    return (
      <button ref={ref} className={cn("uv-cta", t.cls, className)} {...props}>
        <span>{children}</span>
        <ArrowCircle stroke={t.stroke} />
      </button>
    );
  },
);

export function CtaLink({ href, tone = "dark", className, children }: { href: string; tone?: Tone; className?: string; children: React.ReactNode }) {
  const t = TONE[tone];
  return (
    <Link href={href} className={cn("uv-cta", t.cls, className)}>
      <span>{children}</span>
      <ArrowCircle stroke={t.stroke} />
    </Link>
  );
}

/** Expanding-circle text link (Uiverse: alexmaracinaru/brown-bobcat-65). */
export function ArrowLink({ href, children, className, onDark }: { href: string; children: React.ReactNode; className?: string; onDark?: boolean }) {
  return (
    <Link
      href={href}
      className={cn("uv-link", onDark ? "text-white" : "text-ink", className)}
      style={onDark ? ({ "--uv-link-bg": "rgb(229 155 208 / 0.28)" } as React.CSSProperties) : undefined}
    >
      <span>{children}</span>
      <svg viewBox="0 0 13 10" width="15" height="10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M1,5 L11,5" />
        <polyline points="8 1 12 5 8 9" />
      </svg>
    </Link>
  );
}

/** Expanding round submit button (Uiverse: vinodjangid07/afraid-falcon-17). */
export const SendButton = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }>(
  function SendButton({ label, className, ...props }, ref) {
    return (
      <button ref={ref} data-label={label} aria-label={label} className={cn("uv-send shrink-0", className)} {...props}>
        <svg viewBox="0 0 384 512" width="12" height="14" fill="currentColor" aria-hidden>
          <path d="M214.6 41.4c-12.5-12.5-32.8-12.5-45.3 0l-160 160c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L160 141.2V448c0 17.7 14.3 32 32 32s32-14.3 32-32V141.2L329.4 246.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3l-160-160z" />
        </svg>
      </button>
    );
  },
);

/** Ring pulse loader (Uiverse: Li-Deheng/bright-firefox-37). */
export function RingsLoader({ className, label }: { className?: string; label?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-3", className)} role="status" aria-live="polite">
      <span className="uv-rings" aria-hidden>
        <i />
        <i />
        <i />
        <i />
      </span>
      {label && <span>{label}</span>}
    </span>
  );
}

/** Sliding bar loader (Uiverse: shadowmurphy/wicked-fish-61). */
export function BarLoader({ className }: { className?: string }) {
  return <div className={cn("uv-bar", className)} role="progressbar" aria-label="In progress" />;
}
