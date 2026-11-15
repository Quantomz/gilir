import { isoDateSchema } from "@/contracts/common";
import type { CropPurposeId, IsoDate } from "@/contracts/common";
import type { LngLat } from "@/contracts/input";

declare const printable: unique symbol;
/**
 * Text the standard Helvetica fonts can encode: Latin-1 plus WinAnsi's extras (‘ ’ “ ” – — … • € ™). pdf-lib throws on
 * the first character outside WinAnsi, which would fail the whole export.
 */
export type PdfText = string & { readonly [printable]: true };

const winAnsiExtras = new Set("ŒœŠšŸŽžƒˆ˜–—‘’‚“”„†‡•…‰‹›€™");

/** The soft hyphen encodes, but Helvetica draws it as a visible hyphen in the middle of a word. */
function encodes(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  return (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff && code !== 0xad) || winAnsiExtras.has(ch);
}

/** Letters and signs that compatibility decomposition can't bring into WinAnsi, with their nearest printable form. */
const similar: Readonly<Record<string, string>> = {
  Ł: "L", ł: "l", Đ: "D", đ: "d", Ħ: "H", ħ: "h", Ŧ: "T", ŧ: "t", Ŀ: "L", ŀ: "l", ı: "i", ȷ: "j", ĸ: "k",
  Ŋ: "N", ŋ: "n", Ə: "E", ə: "e", Ɛ: "E", ɛ: "e", Ɔ: "O", ɔ: "o", ẞ: "SS",
  "ʻ": "‘", "ʼ": "’", "ʹ": "'", "ˈ": "'", "′": "'", "″": "\"",
  "‐": "-", "‑": "-", "‒": "–", "−": "-", "⁃": "-",
  "≤": "<=", "≥": ">=", "≈": "~", "≠": "!=", "→": "->", "←": "<-",
  "\u202f": "\u00a0",
};

const lineBreak = /[\t\n\v\f\r\u0085\u2028\u2029]/u;
const space = /\p{Zs}/u;
const invisible = /[\p{M}\p{Cc}\p{Cf}\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}]/u;
const marks = /\p{M}/gu;

function printOne(ch: string): string | null {
  if (encodes(ch)) return ch;
  const mapped = similar[ch];
  if (mapped !== undefined) return mapped;
  if (lineBreak.test(ch)) return " ";
  if (space.test(ch)) return " ";
  if (invisible.test(ch)) return "";
  const base = ch.normalize("NFKD").replace(marks, "");
  if (base !== "" && [...base].every(encodes)) return base;
  return null;
}

function convert(raw: string): { readonly text: string; readonly lost: boolean } {
  let text = "";
  let lost = false;
  for (const ch of raw.normalize("NFC")) {
    const shown = printOne(ch);
    if (shown === null) lost = true;
    text += shown ?? "?";
  }
  text = text.replace(/ {2,}/g, " ");
  if (!/^\s/u.test(raw)) text = text.replace(/^ /, "");
  if (!/\s$/u.test(raw)) text = text.replace(/ $/, "");
  if (text === "" && raw !== "") return { text: "?", lost: true };
  return { text, lost };
}

/** Any string as close as the fonts allow (Wrocław becomes Wroclaw). A letter with no printable form becomes "?". */
export function pdfText(raw: string): PdfText {
  return convert(raw).text as PdfText;
}

interface OwnName {
  readonly text: PdfText;
  readonly shown: "as_written" | "simplified" | "replaced";
}

/** pdfText for a name the farmer gave, replaced whole by `fallback` when any letter would become "?". */
export function ownName(raw: string, fallback: string): OwnName {
  const { text, lost } = convert(raw);
  if (lost) return { text: pdfText(fallback), shown: "replaced" };
  return { text: text as PdfText, shown: text === raw.normalize("NFC") ? "as_written" : "simplified" };
}

export function subText(text: PdfText, start: number, end?: number): PdfText {
  return text.slice(start, end) as PdfText;
}

export interface Reader {
  readonly locale: string;
  readonly timeZone: string;
}

export interface Say {
  day(date: IsoDate): PdfText;
  range(first: IsoDate, last: IsoDate): PdfText;
  monthYear(date: IsoDate): PdfText;
  /** 1 is January. */
  month(month: number): PdfText;
  /** The day of an ISO datetime in the reader's time zone. */
  made(completedAt: string): PdfText;
}

const forms = {
  day: { day: "numeric", month: "short", year: "numeric" },
  dayMonth: { day: "numeric", month: "short" },
  monthYear: { month: "short", year: "numeric" },
  month: { month: "short" },
} as const satisfies Record<string, Intl.DateTimeFormatOptions>;

const fallbackLocale = "en-GB";

function formatter(locale: string, form: keyof typeof forms, timeZone = "UTC"): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(locale, { ...forms[form], calendar: "gregory", numberingSystem: "latn", timeZone });
}

function printableLocale(locale: string): string {
  try {
    for (const form of Object.keys(forms) as (keyof typeof forms)[]) {
      const format = formatter(locale, form);
      for (let month = 0; month < 12; month++) {
        if (![...format.format(new Date(Date.UTC(2026, month, 15)))].every(encodes)) return fallbackLocale;
      }
    }
    return locale;
  } catch {
    return fallbackLocale;
  }
}

function validZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat(fallbackLocale, { timeZone });
    return timeZone;
  } catch {
    return "UTC";
  }
}

export const utcDay = (date: IsoDate) => new Date(`${date}T00:00:00Z`);

/** Dates in the reader's locale when every month prints in it unchanged, else en-GB for the whole file. */
export function sayFor(reader: Reader): Say {
  const locale = printableLocale(reader.locale);
  const zone = validZone(reader.timeZone);
  const day = formatter(locale, "day");
  const dayMonth = formatter(locale, "dayMonth");
  const monthYear = formatter(locale, "monthYear");
  const month = formatter(locale, "month");
  const made = formatter(locale, "day", zone);
  return {
    day: date => pdfText(day.format(utcDay(date))),
    range: (first, last) => pdfText(first.slice(0, 4) === last.slice(0, 4)
      ? `${dayMonth.format(utcDay(first))} to ${day.format(utcDay(last))}`
      : `${day.format(utcDay(first))} to ${day.format(utcDay(last))}`),
    monthYear: date => pdfText(monthYear.format(utcDay(date))),
    month: value => pdfText(month.format(new Date(Date.UTC(2026, value - 1, 15)))),
    made: completedAt => pdfText(made.format(new Date(completedAt))),
  };
}

/** The snapshot holds crop IDs, not labels, and src/client may not import the registry. */
export function cropName(id: CropPurposeId): PdfText {
  const words = id.replace(/[-_:]+/g, " ");
  return pdfText(words.charAt(0).toUpperCase() + words.slice(1));
}

export function coordinates([longitude, latitude]: LngLat): PdfText {
  const part = (value: number, positive: string, negative: string) =>
    `${Math.abs(value).toFixed(3)}° ${value < 0 ? negative : positive}`;
  return pdfText(`${part(latitude, "N", "S")}, ${part(longitude, "E", "W")}`);
}

const isoDateInText = /\b\d{4}-\d{2}-\d{2}\b/g;

export function engineText(text: string, say: Say): PdfText {
  return pdfText(text.replace(isoDateInText, match => {
    const date = isoDateSchema.safeParse(match);
    return date.success ? say.day(date.data) : match;
  }));
}
