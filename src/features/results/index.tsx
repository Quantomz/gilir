"use client";
import { useEffect, useSyncExternalStore } from "react";
import type { ReactElement } from "react";
import { exportPdf, preparePdf } from "@/client/pdf";
import { localPlans, readStorageNotice, storageProblem } from "@/client/storage";
import type { ResultsProps } from "../ports";
import { ResultScreen } from "./screen";
import { createKeeper } from "./services/keeper";
import "./results.css";

const keeper = createKeeper({ plans: localPlans, exportPdf, storageProblem, notice: readStorageNotice });

/**
 * Draws after hydration only. Dates are said in the browser's language and time zone, which a server cannot know, so
 * the fixture lab's server pass renders nothing instead of a hydration mismatch. The key makes a new snapshot a new
 * screen: its session, and its read of storage, start again. The PDF code is fetched as soon as a result is on screen,
 * so Download PDF still works if the connection drops later.
 */
export function Results(props: ResultsProps): ReactElement | null {
  const hydrated = useSyncExternalStore(noSubscription, () => true, () => false);
  useEffect(() => preparePdf(), []);
  if (!hydrated) return null;
  return <ResultScreen key={props.snapshot.id} given={props.snapshot} onChangeInputs={props.onChangeInputs} keeper={keeper} />;
}

function noSubscription(): () => void {
  return () => undefined;
}
