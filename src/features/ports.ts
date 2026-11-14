import type { CompletedSnapshot, FarmInput, PlannerClient } from "@/contracts";
export interface FieldPickerProps { value: FarmInput["field"] | null; onChange(value: FarmInput["field"]): void }
export interface OnboardingProps { client: PlannerClient; initialInput: FarmInput | null; onCompleted(snapshot: CompletedSnapshot): void }
export interface ResultsProps { snapshot: CompletedSnapshot; onChangeInputs(input: FarmInput): void }
