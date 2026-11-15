"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "./api";

export const useHealth = () => useQuery({ queryKey: ["health"], queryFn: api.health, staleTime: 60_000 });
export const useStats = () => useQuery({ queryKey: ["stats"], queryFn: api.stats, refetchInterval: 30_000 });
export const useFeed = () => useQuery({ queryKey: ["feed"], queryFn: api.feed, refetchInterval: 60_000 });
export const useThreats = () => useQuery({ queryKey: ["threats"], queryFn: api.threats, refetchInterval: 20_000 });

export const useCheck = (input: string | null) =>
  useQuery({
    queryKey: ["check", input],
    queryFn: () => api.check(input!),
    enabled: Boolean(input),
    staleTime: 5 * 60_000,
  });

export const useWalletScan = (address: string | null) =>
  useQuery({
    queryKey: ["scan", address],
    queryFn: () => api.scanWallet(address!),
    enabled: Boolean(address),
    staleTime: 5 * 60_000,
  });

/** Polls a submitted threat until Reppo settles it. */
export const useReppoStatus = (threatId: string | null) =>
  useQuery({
    queryKey: ["reppo", threatId],
    queryFn: () => api.reppoStatus(threatId!),
    enabled: Boolean(threatId),
    refetchInterval: (q) => (q.state.data?.threat.status === "submitted" || !q.state.data ? 15_000 : false),
  });

export const useSubmitToReppo = () =>
  useMutation({
    mutationFn: ({ fingerprint, walletId }: { fingerprint: string; walletId: "A" | "B" }) =>
      api.submitToReppo(fingerprint, walletId),
  });
