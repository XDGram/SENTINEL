"use client";

import { useEffect, useRef } from "react";
import { useFeed } from "@/lib/client/hooks";

const NEUTRAL = ["#3f3f3f", "#525252", "#5c5c5c", "#7a7a7a", "#0a0a0a", "#6b6b6b", "#9a9a9a"];
const DARK = ["#111111", "#2a2a2a", "#8a8a8a", "#444444", "#bdbdbd", "#666666"];

function rand(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  s: number;
  c: string;
  life: number;
  max: number;
  p: number;
}

/**
 * Speckled "debris" band between the light hero and the dark sections.
 * A pre-rendered dense layer breathes slowly; a live layer of motes rises
 * out of it, drifts, fades, and scatters away from the cursor.
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
    let motes: Mote[] = [];
    const mouse = { x: -9999, y: -9999 };
    const r = rand(42);

    const spawn = (m?: Mote, initial = false): Mote => {
      const o = m ?? ({} as Mote);
      o.x = r() * w;
      o.y = initial ? h * (0.15 + r() * 0.85) : h * (0.7 + r() * 0.3);
      o.vx = (r() - 0.5) * 0.15;
      o.vy = -(0.08 + r() * 0.35);
      o.s = r() < 0.12 ? 2.2 : 0.9 + r() * 1.1;
      o.c = r() < 0.35 ? DARK[Math.floor(r() * DARK.length)] : NEUTRAL[Math.floor(r() * NEUTRAL.length)];
      o.max = 260 + r() * 520;
      o.life = initial ? r() * o.max : 0;
      o.p = r() * Math.PI * 2;
      return o;
    };

    const seed = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const rb = rand(7);
      base = document.createElement("canvas");
      base.width = canvas.width + 40 * dpr;
      base.height = canvas.height;
      const b = base.getContext("2d")!;
      b.setTransform(dpr, 0, 0, dpr, 0, 0);
      const bw = w + 40;
      const n = Math.round(bw * 12);
      for (let i = 0; i < n; i++) {
        const x = rb() * bw;
        const edge = h * (0.22 + 0.12 * Math.sin(x / 90) * Math.sin(x / 37) + rb() * 0.08);
        const t = Math.pow(rb(), 0.7);
        const y = edge + t * (h - edge);
        const depth = (y - edge) / (h - edge || 1);
        const dark = rb() < 0.5 * Math.max(0, 1 - Math.abs(depth - 0.35) * 2.2);
        b.globalAlpha = dark ? 0.55 + rb() * 0.45 : 0.35 + depth * 0.65;
        b.fillStyle = dark ? DARK[Math.floor(rb() * DARK.length)] : NEUTRAL[Math.floor(rb() * NEUTRAL.length)];
        const s = rb() < 0.1 ? 2.2 : 1 + rb() * 1.1;
        b.fillRect(x, y, s, s);
      }
      b.globalAlpha = 1;
      motes = Array.from({ length: Math.round(Math.min(1400, w * 0.9)) }, () => spawn(undefined, true));
    };

    const draw = (time: number) => {
      const t = time / 1000;
      ctx.clearRect(0, 0, w, h);
      // Dense layer breathes side to side.
      if (base) ctx.drawImage(base, -20 + Math.sin(t / 6) * 14, 0, w + 40, h);
      if (reduce) return;
      for (const m of motes) {
        m.life++;
        // Cursor scatters nearby motes.
        const dx = m.x - mouse.x;
        const dy = m.y - mouse.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 9000) {
          const f = (1 - d2 / 9000) * 0.6;
          const d = Math.sqrt(d2) || 1;
          m.vx += (dx / d) * f;
          m.vy += (dy / d) * f;
        }
        m.vx = m.vx * 0.96 + Math.sin(t * 0.8 + m.p) * 0.004;
        m.vy = m.vy * 0.98 - 0.004;
        m.x += m.vx;
        m.y += m.vy;
        const k = m.life / m.max;
        const alpha = Math.min(1, k * 4) * (1 - k) * (0.3 + (m.y / h) * 0.7);
        if (k >= 1 || m.y < -5 || m.x < -5 || m.x > w + 5) {
          spawn(m);
          continue;
        }
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.fillStyle = m.c;
        ctx.fillRect(m.x, m.y, m.s, m.s);
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

    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    };
    const onLeave = () => {
      mouse.x = -9999;
      mouse.y = -9999;
    };
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);
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
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div className="relative bg-[linear-gradient(to_bottom,transparent_0%,transparent_55%,#a3a3a3_80%,var(--color-deep)_100%)]">
      <canvas ref={ref} className="block h-[220px] w-full sm:h-[300px]" aria-hidden />
      <p className="label-mono pointer-events-none absolute right-4 bottom-3 rounded-full bg-deep/80 px-3 py-1 text-white/80 backdrop-blur sm:right-6">
        {feed.isSuccess
          ? `${verified} Reppo-verified attacker${verified === 1 ? "" : "s"} in Watchdog's memory`
          : "Loading threat memory…"}
      </p>
    </div>
  );
}
