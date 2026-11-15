"use client";

import { useEffect, useRef } from "react";
import { useFeed } from "@/lib/client/hooks";

const NEUTRAL = ["#3f3f3f", "#525252", "#5c5c5c", "#7a7a7a", "#0a0a0a", "#6b6b6b", "#9a9a9a"];
const PINK = ["#111111", "#2a2a2a", "#8a8a8a", "#444444", "#bdbdbd", "#666666"];

function rand(seed: number) {
  // Deterministic PRNG so the band looks the same on every render.
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Speckled band between the light hero and the dark sections.
 * Static speckle is pre-rendered once; only a small twinkle layer animates.
 */
export function ThreatField() {
  const ref = useRef<HTMLCanvasElement>(null);
  const feed = useFeed();
  const verified = feed.data?.count ?? 0;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let visible = true;
    let w = 0;
    let h = 0;
    let base: HTMLCanvasElement | null = null;
    let twinkle: { x: number; y: number; r: number; c: string; p: number }[] = [];

    const seed = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const r = rand(42);
      base = document.createElement("canvas");
      base.width = canvas.width;
      base.height = canvas.height;
      const b = base.getContext("2d")!;
      b.setTransform(dpr, 0, 0, dpr, 0, 0);

      // The band: a ragged top edge, densest in the middle-lower part, fully
      // solid at the bottom where it meets the dark section.
      const n = Math.round(w * 14);
      for (let i = 0; i < n; i++) {
        const x = r() * w;
        const edge = h * (0.18 + 0.12 * Math.sin(x / 90) * Math.sin(x / 37) + r() * 0.08);
        const t = Math.pow(r(), 0.7);
        const y = edge + t * (h - edge);
        const depth = (y - edge) / (h - edge || 1);
        const pinkChance = 0.55 * Math.max(0, 1 - Math.abs(depth - 0.35) * 2.2);
        const pink = r() < pinkChance;
        b.globalAlpha = pink ? 0.55 + r() * 0.45 : 0.35 + depth * 0.65;
        b.fillStyle = pink ? PINK[Math.floor(r() * PINK.length)] : NEUTRAL[Math.floor(r() * NEUTRAL.length)];
        const s = r() < 0.1 ? 2.2 : 1 + r() * 1.1;
        b.fillRect(x, y, s, s);
      }
      // Sparse drift above the band, like the reference's dissolving edge.
      for (let i = 0; i < w * 0.8; i++) {
        b.globalAlpha = 0.15 + r() * 0.35;
        b.fillStyle = r() < 0.4 ? PINK[Math.floor(r() * PINK.length)] : NEUTRAL[Math.floor(r() * 4)];
        b.fillRect(r() * w, r() * h * 0.35, 1, 1);
      }
      b.globalAlpha = 1;

      twinkle = Array.from({ length: Math.round(w * 0.5) }, () => ({
        x: r() * w,
        y: h * (0.3 + r() * 0.6),
        r: 1.2 + r() * 1.4,
        c: PINK[Math.floor(r() * PINK.length)],
        p: r() * Math.PI * 2,
      }));
    };

    const draw = (time: number) => {
      ctx.clearRect(0, 0, w, h);
      if (base) ctx.drawImage(base, 0, 0, w, h);
      const t = time / 1000;
      if (!reduce) {
        for (const d of twinkle) {
          ctx.globalAlpha = Math.max(0, Math.sin(t * 1.4 + d.p)) * 0.9;
          ctx.fillStyle = d.c;
          ctx.fillRect(d.x, d.y, d.r, d.r);
        }
      }
      ctx.globalAlpha = 1;
    };

    const loop = (time: number) => {
      if (visible) draw(time);
      raf = requestAnimationFrame(loop);
    };

    seed();
    if (reduce) draw(0);
    else raf = requestAnimationFrame(loop);
    const ro = new ResizeObserver(() => {
      seed();
      draw(performance.now());
    });
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(canvas);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, []);

  return (
    <div className="relative bg-[linear-gradient(to_bottom,var(--color-canvas)_0%,var(--color-canvas)_55%,#a3a3a3_80%,var(--color-deep)_100%)]">
      <canvas ref={ref} className="block h-[200px] w-full sm:h-[260px]" aria-hidden />
      <p className="label-mono absolute right-4 bottom-3 rounded-full bg-deep/80 px-3 py-1 text-white/80 backdrop-blur sm:right-6">
        {feed.isSuccess
          ? `${verified} Reppo-verified attacker${verified === 1 ? "" : "s"} in Watchdog's memory`
          : "Loading threat memory…"}
      </p>
    </div>
  );
}
