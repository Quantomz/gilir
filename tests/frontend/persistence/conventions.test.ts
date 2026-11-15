import ts from "typescript";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { localPlans } from "@/client/storage";
import type { LocalPlans, LocalState } from "@/client/storage";
import type { CompletedSnapshot, FarmInput, JobCapability } from "@/contracts";
import { exportedNames, moduleUses, parse, walk } from "../pdf/support/source";

afterEach(() => {
  vi.doUnmock("idb");
});

const storagePath = "src/client/storage.ts";

function nodes(): ts.Node[] {
  const found: ts.Node[] = [];
  walk(parse(storagePath), node => { found.push(node); });
  return found;
}

function zodDeclarations(): string[] {
  return nodes().filter(ts.isVariableDeclaration).filter(declaration => {
    let usesZod = false;
    if (declaration.initializer) {
      walk(declaration.initializer, node => {
        if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "z") usesZod = true;
      });
    }
    return usesZod;
  }).map(declaration => declaration.name.getText());
}

describe("src/client/storage.ts", () => {
  it("exports exactly LocalState, LocalPlans, localPlans, StorageReason, storageProblem, StorageNotice and readStorageNotice", async () => {
    expect(exportedNames(storagePath).sort()).toEqual(
      ["LocalPlans", "LocalState", "StorageNotice", "StorageReason", "localPlans", "readStorageNotice", "storageProblem"].sort(),
    );
    expect(Object.keys(await import("@/client/storage")).sort()).toEqual(["localPlans", "readStorageNotice", "storageProblem"]);
  });

  it("LocalState and LocalPlans keep the frozen shapes (expectTypeOf against the contract's field types)", () => {
    expectTypeOf<LocalState>().toEqualTypeOf<{
      readonly draft: Partial<FarmInput> | null;
      readonly step: number;
      readonly activeJob: JobCapability | null;
      readonly snapshot: CompletedSnapshot | null;
    }>();
    expectTypeOf<LocalPlans["load"]>().toEqualTypeOf<() => Promise<LocalState | null>>();
    expectTypeOf<LocalPlans["save"]>().toEqualTypeOf<(state: LocalState) => Promise<void>>();
    expectTypeOf<LocalPlans["clear"]>().toEqualTypeOf<() => Promise<void>>();
    expectTypeOf<keyof LocalPlans>().toEqualTypeOf<"load" | "save" | "clear">();
    expectTypeOf(localPlans).toEqualTypeOf<LocalPlans>();
  });

  it("imports completedSnapshotSchema and farmInputSchema from src/contracts, and its only own zod schema is the job capability guard", () => {
    const imports = moduleUses(storagePath).filter(use => use.kind === "static value");
    expect(imports).toContainEqual(expect.objectContaining({ specifier: "@/contracts/result", names: ["completedSnapshotSchema"] }));
    expect(imports).toContainEqual(expect.objectContaining({ specifier: "@/contracts/input", names: ["farmInputSchema"] }));
    expect(zodDeclarations()).toEqual(["capabilityGuard"]);
  });

  it("vitest/node still exports createViteServer, which starts the browser harness's Vite", async () => {
    expect(typeof (await import("vitest/node")).createViteServer).toBe("function");
  });

  it("has no fetch, no console and no localStorage", () => {
    const identifiers = new Set(nodes().filter(ts.isIdentifier).map(node => node.text));
    for (const name of ["fetch", "console", "localStorage", "sessionStorage", "XMLHttpRequest", "sendBeacon", "WebSocket"]) {
      expect(identifiers.has(name), name).toBe(false);
    }
  });

  it("importing it touches no browser global: indexedDB, location and navigator are read only inside functions (the prerendered / imports it)", async () => {
    const watched = ["indexedDB", "location", "navigator", "window", "document", "localStorage"];
    const originals = new Map(watched.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    const touched: string[] = [];
    for (const name of watched) {
      Object.defineProperty(globalThis, name, { configurable: true, get: () => { touched.push(name); return undefined; } });
    }
    try {
      vi.resetModules();
      const storage = await import("@/client/storage");
      expect(touched).toEqual([]);
      await storage.localPlans.load().catch(() => undefined);
      expect(touched).toEqual(expect.arrayContaining(["location", "indexedDB"]));
    } finally {
      for (const [name, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else Reflect.deleteProperty(globalThis, name);
      }
    }
  });
});
