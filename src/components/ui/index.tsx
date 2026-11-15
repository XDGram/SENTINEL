import { forwardRef } from "react";
import { cn } from "@/lib/cn";

type ButtonVariant = "dark" | "light" | "ghost" | "outline" | "danger" | "safe";

const BUTTON: Record<ButtonVariant, string> = {
  dark: "bg-ink text-white hover:bg-ink/90",
  light: "bg-white text-ink hover:bg-white/90",
  ghost: "text-current hover:bg-black/5",
  outline: "border border-current/20 hover:bg-black/5",
  danger: "bg-risky text-white hover:bg-risky/90",
  safe: "bg-safe text-white hover:bg-safe/90",
};

export const Button = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: "sm" | "md" | "lg" }
>(function Button({ className, variant = "dark", size = "md", ...props }, ref) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
        size === "sm" ? "h-8 px-3 text-xs" : size === "lg" ? "h-12 px-6 text-sm" : "h-10 px-4 text-sm",
        BUTTON[variant],
        className,
      )}
      {...props}
    />
  );
});

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-[var(--radius-card)] border border-line bg-surface", className)} {...props} />;
}

export function Pill({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", className)}
      {...props}
    />
  );
}

export function Skeleton({ className, dark }: { className?: string; dark?: boolean }) {
  return <div aria-hidden className={cn(dark ? "dark-skeleton" : "skeleton", className)} />;
}

export function MonoLabel({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("label-mono", className)} {...props} />;
}

export function Container({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mx-auto w-full max-w-[1200px] px-4 sm:px-6", className)} {...props} />;
}
