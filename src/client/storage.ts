import type { CompletedSnapshot, FarmInput, JobCapability } from "@/contracts";
export interface LocalState {
  readonly draft: Partial<FarmInput> | null;
  readonly step: number;
  readonly activeJob: JobCapability | null;
  readonly snapshot: CompletedSnapshot | null;
}
export interface LocalPlans {
  load(): Promise<LocalState | null>;
  save(state: LocalState): Promise<void>;
  clear(): Promise<void>;
}
export const localPlans: LocalPlans = {
  async load() { throw new Error("Local storage is not implemented. Follow F4."); },
  async save() { throw new Error("Local storage is not implemented. Follow F4."); },
  async clear() { throw new Error("Local storage is not implemented. Follow F4."); },
};
