"use client";

import { ArrowUp, Loader2 } from "lucide-react";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { Analysis, WalletAction } from "@/lib/types";
import { api, ApiError } from "@/lib/client/api";
import { cn } from "@/lib/cn";
import { ListenButton, MicButton, MuteToggle } from "@/components/voice";
import { composeAnswerSpeech } from "@/lib/speech-text";

const SUGGESTIONS = ["Is it safe if I only sign and don't send money?", "How do I know the real address?", "What should I do now?"];

export function AskSentinel({ action, analysis, dark }: { action: WalletAction; analysis: Analysis; dark?: boolean }) {
  const [q, setQ] = useState("");
  const [thread, setThread] = useState<{ q: string; a: string; serv: boolean }[]>([]);
  const ask = useMutation({
    mutationFn: (question: string) => api.ask(action, analysis, question),
    onSuccess: (res, question) => setThread((t) => [...t, { q: question, a: res.answer, serv: res.servUsed }]),
  });

  const send = (text: string) => {
    const question = text.trim();
    if (!question || ask.isPending) return;
    setQ("");
    ask.mutate(question);
  };

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h4 className={cn("label-mono", dark ? "text-white/45" : "text-ink-soft")}>Ask Watchdog</h4>
        <MuteToggle dark={dark} />
      </div>
      <div className="space-y-3">
        {thread.map((m, i) => (
          <div key={i} className="space-y-2 text-sm">
            <p className={cn("ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm px-3 py-2", dark ? "bg-white/10 text-white" : "bg-ink text-white")}>
              {m.q}
            </p>
            <p className={cn("max-w-[92%] rounded-2xl rounded-bl-sm px-3 py-2 leading-6", dark ? "bg-white/[0.04] text-white/85" : "bg-white text-ink")}>
              {m.a}
              <span className="mt-2 flex flex-wrap items-center gap-2">
                {m.serv && <span className={cn("label-mono", dark ? "text-white/35" : "text-ink-soft")}>SERV Reasoning</span>}
                <ListenButton text={composeAnswerSpeech(m.a)} id={`ask-${i}`} source="answer" dark={dark} />
              </span>
            </p>
          </div>
        ))}
        {ask.isError && (
          <p className="text-sm text-risky">{ask.error instanceof ApiError ? ask.error.message : "Something went wrong."}</p>
        )}
        {thread.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs transition-colors",
                  dark ? "border-line-dark text-white/70 hover:bg-white/5" : "border-line text-ink-soft hover:bg-black/5",
                )}
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(q);
          }}
          className={cn("flex items-center gap-2 rounded-full border p-1 pl-4", dark ? "border-line-dark bg-white/[0.03]" : "border-line bg-white")}
        >
          <label htmlFor="ask-sentinel" className="sr-only">Ask a follow-up question</label>
          <input
            id="ask-sentinel"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            maxLength={500}
            placeholder="Ask a follow-up question…"
            className={cn("min-w-0 flex-1 bg-transparent text-sm outline-none", dark ? "text-white placeholder:text-white/35" : "placeholder:text-ink-soft/70")}
          />
          <MicButton onTranscript={setQ} onSubmit={send} dark={dark} />
          <button
            type="submit"
            disabled={!q.trim() || ask.isPending}
            className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full disabled:opacity-40", dark ? "bg-white text-ink" : "bg-ink text-white")}
            aria-label="Send question"
          >
            {ask.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
          </button>
        </form>
      </div>
    </section>
  );
}
