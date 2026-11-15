import { PDFDocument, StandardFonts } from "pdf-lib";
import type { PDFFont } from "pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";
import { parseCropPurposeId, parseIsoDate } from "@/contracts/common";
import { coordinates, cropName, engineText, ownName, pdfText, sayFor } from "@/client/pdf/text";
import { completedSnapshotsByState } from "@/fixtures/results";
import { frozen } from "./support/variants";

let fonts: readonly PDFFont[] = [];
beforeAll(async () => {
  const doc = await PDFDocument.create();
  fonts = [await doc.embedFont(StandardFonts.Helvetica), await doc.embedFont(StandardFonts.HelveticaBold)];
});

function drawable(text: string): boolean {
  try {
    for (const font of fonts) font.widthOfTextAtSize(text, 14);
    return true;
  } catch {
    return false;
  }
}

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ranges: readonly (readonly [number, number])[] = [
  [0x0, 0x7f], [0x80, 0x24f], [0x300, 0x36f], [0x370, 0x6ff], [0xe00, 0xe7f], [0x1e00, 0x1eff], [0x2000, 0x206f],
  [0x2190, 0x22ff], [0x3000, 0x9fff], [0xac00, 0xd7a3], [0xd800, 0xdfff], [0xfe00, 0xffff], [0x1f300, 0x1faff],
  [0x10000, 0x10ffff], [0xe0000, 0xe007f],
];

describe("pdfText", () => {
  it("every character it can emit is accepted by pdf-lib's own Helvetica encoder (the map cannot drift from the font)", () => {
    const emitted = new Set<string>();
    const planes = [[0x0, 0x3ffff], [0xe0000, 0xe01ef]] as const;
    for (const [first, last] of planes) {
      for (let code = first; code <= last; code++) {
        const ch = code >= 0xd800 && code <= 0xdfff ? String.fromCharCode(code) : String.fromCodePoint(code);
        for (const out of pdfText(ch)) emitted.add(out);
      }
    }
    const refused = [...emitted].filter(ch => !drawable(ch));
    expect(refused).toEqual([]);
    expect(emitted.size).toBeGreaterThan(150);
  });

  it("never throws and never empties non-empty input, for 1,000 random strings across the Unicode planes", () => {
    const random = seeded(20261115);
    for (let i = 0; i < 1000; i++) {
      let raw = "";
      const length = 1 + Math.floor(random() * 24);
      for (let j = 0; j < length; j++) {
        const [first, last] = ranges[Math.floor(random() * ranges.length)];
        const code = first + Math.floor(random() * (last - first + 1));
        raw += code >= 0xd800 && code <= 0xdfff ? String.fromCharCode(code) : String.fromCodePoint(code);
      }
      const out = pdfText(raw);
      expect(out.length, JSON.stringify(raw)).toBeGreaterThan(0);
      expect(drawable(out), JSON.stringify(raw)).toBe(true);
    }
  });

  it("keeps WinAnsi as it is: ’ “ ” – — … · • ° × ÷ é ñ ü ø ß", () => {
    const kept = "’ “ ” – — … · • ° × ÷ é ñ ü ø ß Œ € ™ São Paulo, Kraków, Reykjavík, Tromsø";
    expect(pdfText(kept)).toBe(kept);
  });

  it("simplifies: Łódź to Lódz, Wrocław to Wroclaw, Cần Thơ to Can Tho, Kāneʻohe to Kane‘ohe, (D − P) ÷ D to (D - P) ÷ D", () => {
    expect(pdfText("Łódź")).toBe("Lódz");
    expect(pdfText("Wrocław")).toBe("Wroclaw");
    expect(pdfText("Cần Thơ")).toBe("Can Tho");
    expect(pdfText("Kāneʻohe")).toBe("Kane‘ohe");
    expect(pdfText("(D − P) ÷ D")).toBe("(D - P) ÷ D");
    expect(pdfText("Şanlıurfa, İzmir, Đà Lạt, Constanța")).toBe("Sanliurfa, Izmir, Dà Lat, Constanta");
    expect(pdfText("rain ≤ need → shortfall")).toBe("rain <= need -> shortfall");
  });

  it("turns U+202F into a no-break space, tabs and line breaks into spaces, and drops zero-width and direction marks and pictographs", () => {
    expect(pdfText("1\u202f234")).toBe("1\u00a0234");
    expect(pdfText("first line\nsecond\tcolumn\r\nthird")).toBe("first line second column third");
    expect(pdfText("Rai\u200bnfall\u200e \u200fnote\ufeff\u061c")).toBe("Rainfall note");
    expect(pdfText("Field 🌾 near the river 👨\u200d🌾🏽 🇹🇭")).toBe("Field near the river");
    expect(pdfText("soft\u00adhyphen")).toBe("softhyphen");
  });
});

describe("ownName", () => {
  it("a Latin name is as_written and an accented one simplified, with the text kept", () => {
    expect(ownName("Synthetic example field", "Your field")).toEqual({ text: "Synthetic example field", shown: "as_written" });
    expect(ownName("Córdoba", "Your field")).toEqual({ text: "Córdoba", shown: "as_written" });
    expect(ownName("Field near Łódź", "Your field")).toEqual({ text: "Field near Lódz", shown: "simplified" });
  });

  it("a Thai, Cyrillic or Arabic name is replaced by the fallback, never by question marks", () => {
    for (const name of ["กรุงเทพมหานคร", "Поле у Москвы", "حقل القاهرة", "Field 東京"]) {
      const shown = ownName(name, "Your field");
      expect(shown).toEqual({ text: "Your field", shown: "replaced" });
    }
    expect(ownName("ข้าวเหนียว", "A crop not on our list").text).toBe("A crop not on our list");
  });

  it("an emoji in an otherwise Latin name is dropped and the name kept", () => {
    expect(ownName("Field near Łódź, Poland 🌾", "Your field")).toEqual({ text: "Field near Lódz, Poland", shown: "simplified" });
    expect(ownName("🌾", "Your field")).toEqual({ text: "Your field", shown: "replaced" });
  });
});

const date = parseIsoDate;
const english = { day: "1 Jul 2026", october: "Oct", monthYear: "Oct 2026", range: "1 Jul to 4 Jul 2026" };

describe("sayFor", () => {
  it("en-GB: day 1 Jul 2026, range 1 Jul to 4 Jul 2026; de-DE, pt-BR, fr-FR and vi-VN keep their own printable forms", () => {
    const british = sayFor({ locale: "en-GB", timeZone: "UTC" });
    expect(british.day(date("2026-07-01"))).toBe("1 Jul 2026");
    expect(british.range(date("2026-07-01"), date("2026-07-04"))).toBe("1 Jul to 4 Jul 2026");
    expect(british.range(date("2026-07-05"), date("2027-06-30"))).toBe("5 Jul 2026 to 30 Jun 2027");
    expect(british.monthYear(date("2026-07-01"))).toBe("Jul 2026");
    expect(british.month(10)).toBe("Oct");
    expect(sayFor({ locale: "en-US", timeZone: "UTC" }).range(date("2026-07-01"), date("2026-07-04"))).toBe("Jul 1 to Jul 4, 2026");
    expect(sayFor({ locale: "de-DE", timeZone: "UTC" }).day(date("2026-07-01"))).toBe("1. Juli 2026");
    expect(sayFor({ locale: "pt-BR", timeZone: "UTC" }).day(date("2026-07-01"))).toBe("1 de jul. de 2026");
    expect(sayFor({ locale: "fr-FR", timeZone: "UTC" }).day(date("2026-07-01"))).toBe("1 juil. 2026");
    expect(sayFor({ locale: "vi-VN", timeZone: "UTC" }).day(date("2026-07-01"))).toBe("1 thg 7, 2026");
  });

  it("cs-CZ, th-TH, ja-JP, ar-EG, hi-IN, ru-RU, pl-PL and tr-TR use the English form for every date in the file", () => {
    for (const locale of ["cs-CZ", "th-TH", "ja-JP", "ar-EG", "hi-IN", "ru-RU", "pl-PL", "tr-TR", "not a locale"]) {
      const say = sayFor({ locale, timeZone: "UTC" });
      expect({
        day: say.day(date("2026-07-01")),
        october: say.month(10),
        monthYear: say.monthYear(date("2026-10-01")),
        range: say.range(date("2026-07-01"), date("2026-07-04")),
      }, locale).toEqual(english);
    }
  });

  it("one decision per reader: pl-PL prints July but not October, so July is English too", () => {
    expect(sayFor({ locale: "pl-PL", timeZone: "UTC" }).month(7)).toBe("Jul");
    expect(sayFor({ locale: "pl-PL", timeZone: "UTC" }).made("2026-07-01T00:00:00Z")).toBe("1 Jul 2026");
  });

  it("th-TH prints the Gregorian year 2026, not 2569", () => {
    expect(sayFor({ locale: "th-TH", timeZone: "Asia/Bangkok" }).day(date("2026-07-01"))).toBe("1 Jul 2026");
    expect(sayFor({ locale: "th-TH-u-ca-buddhist", timeZone: "UTC" }).monthYear(date("2026-07-01"))).toBe("Jul 2026");
    expect(sayFor({ locale: "en-US-u-ca-buddhist", timeZone: "UTC" }).day(date("2026-07-01"))).toBe("Jul 1, 2026");
  });

  it("an ISO calendar date never shifts by a day in zones east or west of UTC", () => {
    for (const timeZone of ["Pacific/Kiritimati", "Asia/Tokyo", "America/Los_Angeles", "Pacific/Pago_Pago"]) {
      const say = sayFor({ locale: "en-GB", timeZone });
      expect(say.day(date("2026-07-01")), timeZone).toBe("1 Jul 2026");
      expect(say.range(date("2026-12-31"), date("2027-01-01")), timeZone).toBe("31 Dec 2026 to 1 Jan 2027");
    }
  });

  it("made(): 2026-07-01T02:00:00Z is 30 Jun 2026 for a reader in America/Chicago and 1 Jul 2026 in UTC", () => {
    expect(sayFor({ locale: "en-GB", timeZone: "America/Chicago" }).made("2026-07-01T02:00:00Z")).toBe("30 Jun 2026");
    expect(sayFor({ locale: "en-GB", timeZone: "UTC" }).made("2026-07-01T02:00:00Z")).toBe("1 Jul 2026");
    expect(sayFor({ locale: "en-GB", timeZone: "Asia/Tokyo" }).made("2026-06-30T20:00:00Z")).toBe("1 Jul 2026");
    expect(sayFor({ locale: "en-GB", timeZone: "Not/A_Zone" }).made("2026-07-01T02:00:00Z")).toBe("1 Jul 2026");
  });
});

describe("names, places and engine text", () => {
  it("cropName: a version 1 snapshot names maize-grain maize grain, from the ID, in lower case for the middle of a sentence", () => {
    const version1 = completedSnapshotsByState.plan;
    expect(cropName(version1, parseCropPurposeId("maize-grain"))).toBe("maize grain");
    expect(cropName(version1, parseCropPurposeId("synthetic-crop"))).toBe("synthetic crop");
    expect(cropName(version1, parseCropPurposeId("rice_paddy:wet-season"))).toBe("rice paddy wet season");
  });

  it("cropName: a version 2 snapshot uses its saved label made printable with its own capitals, and an ID that catalogue lacks is named from the ID", () => {
    const version2 = frozen(completedSnapshotsByState.plan, {
      "synthetic-crop": "Synthetic bean (dry grain)", "maize-grain": "Maïs ≥ 90 days (Łódź)", "sorghum-grain": "ข้าวฟ่าง (grain)",
      "brussels-sprouts": "Brussels sprouts",
    });
    expect(cropName(version2, parseCropPurposeId("synthetic-crop"))).toBe("Synthetic bean (dry grain)");
    expect(cropName(version2, parseCropPurposeId("maize-grain"))).toBe("Maïs >= 90 days (Lódz)");
    expect(cropName(version2, parseCropPurposeId("brussels-sprouts"))).toBe("Brussels sprouts");
    expect(cropName(version2, parseCropPurposeId("rice_paddy:wet-season"))).toBe("rice paddy wet season");
    expect(cropName(version2, parseCropPurposeId("sorghum-grain"))).toBe("sorghum grain");
  });

  it("coordinates([100.005, 15.005]) is 15.005° N, 100.005° E; negative values say S and W", () => {
    expect(coordinates([100.005, 15.005])).toBe("15.005° N, 100.005° E");
    expect(coordinates([-58.38, -34.6])).toBe("34.600° S, 58.380° W");
  });

  it("engineText shows the ISO dates inside engine text as the reader's dates and leaves the words alone", () => {
    const text = "Prepare the land before 2026-07-01. Records before 2025-01-01 near Łódź; not a date: 2026-02-30.";
    expect(engineText(text, sayFor({ locale: "en-GB", timeZone: "UTC" })))
      .toBe("Prepare the land before 1 Jul 2026. Records before 1 Jan 2025 near Lódz; not a date: 2026-02-30.");
    expect(engineText("Planted 2026-07-01.", sayFor({ locale: "en-US", timeZone: "Asia/Tokyo" }))).toBe("Planted Jul 1, 2026.");
  });

  it("engineText leaves a date that is part of an ID as it is: a catalogue version, a profile version, a datetime", () => {
    const say = sayFor({ locale: "en-GB", timeZone: "UTC" });
    for (const text of [
      "teff-grain is not in catalogue fao56-hard-windows-2026-11-15.",
      "Crop profile rice-paddy-fao56-tropics-dec (reviewed-2026-11-15.2) was not supplied.",
      "Completed at 2026-11-15T03:00:00Z.",
    ]) expect(engineText(text, say)).toBe(text);
    expect(engineText("Records end 2026-11-15; the next season (2027-01-01) is not used.", say))
      .toBe("Records end 15 Nov 2026; the next season (1 Jan 2027) is not used.");
  });
});
