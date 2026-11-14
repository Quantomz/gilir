import { NotImplementedError } from "@/contracts/common";
import type { ExplanationInput } from "@/contracts/engine";
import type { ResultDetails } from "@/contracts/result";

type ExplainResult = (input: ExplanationInput) => ResultDetails;
export const explainResult: ExplainResult = () => { throw new NotImplementedError("Result explanations"); };
