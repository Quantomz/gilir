import { NotImplementedError } from "@/contracts/common";
import type { IsoDate } from "@/contracts/common";
import type { ClimateCache, EngineSettings } from "@/contracts/climate";
import type { FarmInput } from "@/contracts/input";
import type { ClimatePreparation } from "@/contracts/jobs";

export interface PrepareClimateInput {
  readonly input: FarmInput;
  readonly cutoff: IsoDate;
  readonly settings: EngineSettings;
  readonly cache: ClimateCache;
}

type PrepareClimate = (args: PrepareClimateInput) => Promise<ClimatePreparation>;
export const prepareClimate: PrepareClimate = async () => { throw new NotImplementedError("Climate preparation"); };
