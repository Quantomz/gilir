import type { PdfText } from "./text";

export type PdfDocument = PlanDocument | StatusDocument;
export type PlanDocument = DocumentOf<"plan", Block | TimelineBlock>;
export type StatusDocument = DocumentOf<"status_report", Block>;

interface DocumentOf<K extends string, B> {
  readonly kind: K;
  /** The file's metadata title. */
  readonly title: PdfText;
  readonly head: Head;
  readonly sections: readonly Section<B>[];
  readonly closing: readonly PdfText[];
  /** Layout adds "Page n of N". */
  readonly footer: Footer;
}

export interface Head {
  readonly brand: PdfText;
  readonly title: PdfText;
  readonly place: PdfText;
  readonly lines: readonly PdfText[];
  readonly synthetic: PdfText | null;
  readonly status: { readonly label: PdfText; readonly text: PdfText; readonly tone: StatusTone };
}

export type StatusTone = "ok" | "warn" | "plain";

export interface Footer {
  readonly left: PdfText;
  readonly synthetic: PdfText | null;
}

export interface Section<B> {
  readonly heading: PdfText;
  readonly blocks: readonly B[];
}

export type TextStyle = "body" | "strong" | "small";

export type Block =
  | { readonly kind: "text"; readonly style: TextStyle; readonly text: PdfText }
  | { readonly kind: "list"; readonly marker: "bullet" | "number" | "none"; readonly items: readonly Item[] }
  | { readonly kind: "table"; readonly columns: readonly PdfText[]; readonly rows: readonly (readonly PdfText[])[] };

export interface Item {
  readonly head: PdfText | null;
  readonly lines: readonly PdfText[];
}

export interface TimelineBlock {
  readonly kind: "timeline";
  readonly timeline: Timeline;
}

/** Every `from` is a day count from plan.horizon.start. */
export interface Timeline {
  readonly days: number;
  readonly months: readonly MonthTick[];
  readonly years: readonly { readonly from: number; readonly label: PdfText }[];
  /** In order, inside [0, days), not overlapping, covering every day once. */
  readonly bars: readonly Bar[];
  readonly legend: readonly { readonly look: BarLook; readonly label: PdfText }[];
}

export interface MonthTick {
  readonly from: number;
  readonly days: number;
  readonly label: PdfText | null;
}

export type BarLook = "crop" | "after_harvest" | "no_crop";

export interface Bar {
  readonly look: BarLook;
  readonly from: number;
  readonly days: number;
  /** The number of the row in "When to plant and harvest" that describes this bar. */
  readonly key: number | null;
}
