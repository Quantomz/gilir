"use client";
import { useState } from "react";
import type { CompletedSnapshot, FarmInput } from "@/contracts";
import { inputFixture } from "@/fixtures/input";
import { completedSnapshotFixture, resultFixtures } from "@/fixtures/results";
import { fixtureClient } from "@/fixtures/client";
import { FieldPicker } from "@/features/location";
import { Onboarding } from "@/features/onboarding";
import { Results } from "@/features/results";
export function FixtureLab() {
  const [field, setField] = useState<FarmInput["field"]>(inputFixture.field);
  const [snapshot, setSnapshot] = useState<CompletedSnapshot>(completedSnapshotFixture);
  return <main className="mx-auto max-w-5xl space-y-6 p-6">
    <h1 className="text-3xl font-bold">Synthetic fixture lab</h1>
    <p>Development examples only. These values are invented test data and are not farm advice.</p>
    <FieldPicker value={field} onChange={setField} />
    <Onboarding client={fixtureClient} initialInput={inputFixture} onCompleted={setSnapshot} />
    <Results snapshot={snapshot} onChangeInputs={() => setSnapshot(completedSnapshotFixture)} />
    {Object.entries(resultFixtures).map(([name,result]) => <details key={name}>
      <summary>{name}</summary><pre className="overflow-auto text-xs">{JSON.stringify(result,null,2)}</pre>
      <Results snapshot={{...completedSnapshotFixture,result}} onChangeInputs={() => undefined} />
    </details>)}
  </main>;
}
