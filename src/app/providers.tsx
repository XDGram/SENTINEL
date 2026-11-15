"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { useState } from "react";
import { ToastProvider } from "@/components/ui/toast";
import { VoiceProvider } from "@/components/voice";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
          mutations: { retry: 0 },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <MotionConfig reducedMotion="never">
        <ToastProvider>
          <VoiceProvider>{children}</VoiceProvider>
        </ToastProvider>
      </MotionConfig>
    </QueryClientProvider>
  );
}
