import type { EvidenceValue } from "@/contracts/common";

export const available = <T>(value: T): EvidenceValue<T> => ({ kind: "available", value });
export const unavailable = <T = never>(reason: string): EvidenceValue<T> => ({ kind: "unavailable", reason });
