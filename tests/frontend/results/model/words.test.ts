// Node. Words the product must never say (AGENTS.md, spec.md sections 1, 5 and 6), checked over the text of every
// result page and details page for every fixture and variant, and over every string in words.ts.
process.env.TZ = "America/Los_Angeles";
import { afterEach, describe, expect, it } from "vitest";
import { parseCropPurposeId, parseIsoDate, serviceFailureSchema } from "@/contracts";
import { planSpans } from "@/features/results/model/calendar";
import { detailsPage } from "@/features/results/model/details-page";
import { resultPage } from "@/features/results/model/result-page";
import * as words from "@/features/results/model/words";
import {
  cropNamesOf, dayCount, disclaimers, failureWords, formatIn, frequencyWords, ordinal, shareWords, timeline,
} from "@/features/results/model/words";
import { textOf } from "../support/ports";
import { everySnapshot, shared, variant } from "../support/variants";

const realZone = process.env.TZ;
afterEach(() => {
  if (realZone === undefined) delete process.env.TZ;
  else process.env.TZ = realZone;
});

const date = parseIsoDate;
const crop = parseCropPurposeId;

interface Said {
  readonly where: string;
  readonly text: string;
}

/** The text of the result page and of View details, for every shared fixture and every variant. */
function everyPage(): readonly Said[] {
  const format = formatIn("en-GB");
  return everySnapshot().flatMap(({ name, snapshot }) => [
    { where: `${name}: result`, text: textOf(resultPage(snapshot, format)) },
    { where: `${name}: details`, text: textOf(detailsPage(snapshot, format)) },
  ]);
}

/**
 * Every string the words module holds or makes: the tables as they are, and each word function called with a stand-in
 * for every argument, so a word no fixture reaches is still checked.
 */
function everyWord(): readonly Said[] {
  const found: Said[] = [];
  const walk = (value: unknown, where: string): void => {
    if (typeof value === "string") found.push({ where, text: value });
    else if (typeof value === "function") {
      try {
        walk(value(...Array.from({ length: value.length }, () => "{x}")), where);
      } catch {
        // A formatter or reader that needs a real date or snapshot is checked through the pages instead.
      }
    } else if (typeof value === "object" && value !== null) {
      for (const [key, inner] of Object.entries(value)) walk(inner, `${where}.${key}`);
    }
  };
  walk(words, "words");
  return found;
}

const everything = () => [...everyPage(), ...everyWord()];

function sentencesOf(text: string): string[] {
  return text.split(/\n|(?<=[.!?])\s+/).filter(sentence => sentence.length > 0);
}

describe("forbidden words", () => {
  it("[R38] no page says irrigation required, actual water shortage, probability, chance of, harvest success, bare soil, soil improvement, pest or weed", () => {
    const banned = [/irrigation required/i, /actual water shortage/i, /probabilit/i, /chance of/i, /harvest success/i, /bare soil/i, /soil improvement/i, /\bpests?\b/i, /\bweeds?\b/i];
    const said = everything();
    expect(said.length).toBeGreaterThan(400);
    for (const { where, text } of said) {
      for (const word of banned) expect(text, where).not.toMatch(word);
    }
  });

  it("[R38] yield, fertilizer and cost appear only inside words.disclaimers, word for word", () => {
    const claims = /\byields?\b|fertili[sz]er|\bcosts?\b/i;
    for (const { where, text } of everything()) {
      expect(disclaimers.reduce((rest, disclaimer) => rest.split(disclaimer).join(""), text), where).not.toMatch(claims);
    }
    for (const { where, text } of everyPage().filter(said => said.where.endsWith("details"))) {
      for (const disclaimer of disclaimers) expect(text, where).toContain(disclaimer);
    }
    for (const disclaimer of disclaimers) expect(disclaimer).toMatch(claims);
  });

  it("[R10] no page calls a crop safe from heat, cold or frost", () => {
    for (const { where, text } of everything()) {
      expect(text.replace(/\bnot safe\b/gi, ""), where).not.toMatch(/\bsafe\b|frost-free|heat-proof|no risk/i);
    }
  });

  it("[R6] no page says priority or offers an order to choose", () => {
    const allowed = [
      "You don’t choose it.",
      "Choose fewer crops, or crops that grow faster, then make the plan again.",
      "Choose a crop that grows faster, then make the plan again.",
    ];
    for (const { where, text } of everything()) {
      expect(text, where).not.toMatch(/priorit/i);
      for (const sentence of sentencesOf(text).filter(each => /\b(choose|choice|pick|select|prefer)\b/i.test(each))) {
        expect(allowed, `${where}: ${sentence}`).toContain(sentence);
      }
    }
  });

  it("[R38] no page says will about next season; the ranking and the cohort line say past seasons, not a prediction", () => {
    for (const { where, text } of everything()) expect(text, where).not.toMatch(/\bwill\b|\bwon’t\b|\bguarantee/i);
    const format = formatIn("en-GB");
    for (const { name, snapshot } of everySnapshot()) {
      const page = resultPage(snapshot, format);
      if (page.kind !== "plan") continue;
      const ranking = textOf({ ...page, lead: [], more: page.more.filter(section => section.id === "ranking") });
      expect(ranking, name).toContain("From past seasons, not a prediction. Checked with rain alone.");
      expect(ranking, name).toMatch(/In past seasons, /);
    }
  });

  it("[R29] no page says Threefield, helpline, or any ServiceFailure code", () => {
    const codes = serviceFailureSchema.unwrap().shape.code.options;
    const report = /^What the service reported: .*$/m;
    for (const { where, text } of everything()) {
      expect(text, where).not.toMatch(/Threefield|helpline/i);
      const shown = where.endsWith("details") ? text.replace(report, "") : text;
      for (const code of codes) expect(shown, where).not.toContain(code);
    }
  });

  it("[R8] no page says best plan without not proven beside it", () => {
    let disclosed = 0;
    for (const { where, text } of everything()) {
      expect(text, where).not.toMatch(/best possible|optimal|the best rotation/i);
      for (const sentence of sentencesOf(text).filter(each => /\bbest\b/i.test(each))) {
        expect(sentence, where).toMatch(/not proven/);
        disclosed += 1;
      }
    }
    expect(disclosed).toBeGreaterThan(0);
  });

  it("no U+2013 or U+2014 dash in any word or page", () => {
    for (const { where, text } of everything()) expect(text, where).not.toMatch(/[\u2013\u2014]/);
  });
});

describe("formatting", () => {
  it("[R36] formatIn reads calendar dates as UTC: 2026-07-01 is 1 Jul 2026 with TZ set west and east of UTC", () => {
    for (const zone of ["Pacific/Honolulu", "Pacific/Kiritimati"]) {
      process.env.TZ = zone;
      const format = formatIn("en-GB");
      expect(format.day(date("2026-07-01"))).toBe("1 Jul 2026");
      expect(format.day(date("2026-12-31"))).toBe("31 Dec 2026");
      expect(format.monthRange(date("2000-07-01"), date("2000-07-05"))).toBe("July 2000");
      expect(format.monthRange(date("2000-07-01"), date("2024-07-01"))).toBe("July 2000 to June 2024");
      expect(format.month(1, "long")).toBe("January");
      expect(format.month(12, "short")).toBe("Dec");
    }
  });

  it("[R36] madeOn shows the local day of 2026-07-01T00:00:00Z: 30 Jun 2026 west of UTC", () => {
    process.env.TZ = "America/Los_Angeles";
    expect(formatIn("en-GB").madeOn("2026-07-01T00:00:00Z")).toBe("30 Jun 2026");
    expect(formatIn("en-GB").madeAt("2026-07-01T00:00:00Z")).toBe("30 June 2026, 17:00");
    process.env.TZ = "Asia/Tokyo";
    expect(formatIn("en-GB").madeOn("2026-07-01T00:00:00Z")).toBe("1 Jul 2026");
  });

  it("[R36] dayRange joins with to, never an en dash: 1 Jul to 4 Jul 2026, 5 Jul 2026 to 30 Jun 2027", () => {
    const format = formatIn("en-GB");
    expect(format.dayRange(date("2026-07-01"), date("2026-07-04"))).toBe("1 Jul to 4 Jul 2026");
    expect(format.dayRange(date("2026-07-05"), date("2027-06-30"))).toBe("5 Jul 2026 to 30 Jun 2027");
    expect(format.dayRange(date("2026-07-05"), date("2026-07-05"))).toBe("5 Jul 2026");
  });

  it("[R36] a language whose own calendar is not Gregorian names the Gregorian month and year in Latin digits, so its dates agree with the year line (fa-IR, th-TH)", () => {
    const persian = formatIn("fa-IR");
    expect(persian.day(date("2026-07-01"))).toBe("1 ژوئیه 2026");
    expect(persian.month(7, "long")).toBe("ژوئیه");
    const thai = formatIn("th-TH");
    expect(thai.day(date("2026-07-01"))).toBe("1 ก.ค. 2026");
    expect(thai.monthRange(date("2000-07-01"), date("2024-07-01"))).toBe("กรกฎาคม 2000 to มิถุนายน 2024");
    for (const [locale, format] of [["fa-IR", persian], ["th-TH", thai]] as const) {
      expect(format.whole(2_000_000), locale).toBe("2,000,000");
      const page = resultPage(shared("plan"), format);
      const year = page.lead.flatMap(section => section.blocks).find(block => block.kind === "year");
      expect(year?.kind === "year" ? year.ticks[0].label : null, locale).toMatch(/ 2026$/);
      expect(textOf(page), locale).not.toMatch(/[\u06F0-\u06F9\u0E50-\u0E59]|1405|2569/);
    }
  });

  it("frequencyWords: 0 is Never, 1 is Every week, 0.5 is About 5 in 10 weeks, 0.04 is Fewer than 1 in 10 weeks, 0.96 is More than 9 in 10 weeks", () => {
    expect(frequencyWords(0)).toBe("Never");
    expect(frequencyWords(1)).toBe("Every week");
    expect(frequencyWords(0.5)).toBe("About 5 in 10 weeks");
    expect(frequencyWords(0.9)).toBe("About 9 in 10 weeks");
    expect(frequencyWords(0.04)).toBe("Fewer than 1 in 10 weeks");
    expect(frequencyWords(0.96)).toBe("More than 9 in 10 weeks");
  });

  it("shareWords: 0.25 is about 25%, 0.004 is under 1%, 0.996 is over 99%", () => {
    expect(shareWords(0.25)).toBe("about 25%");
    expect(shareWords(0.004)).toBe("under 1%");
    expect(shareWords(0.996)).toBe("over 99%");
    expect(shareWords(0.995)).toBe("over 99%");
    expect(shareWords(0)).toBe("0%");
    expect(shareWords(1)).toBe("100%");
  });

  it("dayCount: 1 day, 361 days; format.count groups thousands: 2,000,000 tries", () => {
    expect(dayCount(1)).toBe("1 day");
    expect(dayCount(361)).toBe("361 days");
    const format = formatIn("en-GB");
    expect(format.count(2_000_000, "try", "tries")).toBe("2,000,000 tries");
    expect(format.count(1, "past season", "past seasons")).toBe("1 past season");
    expect(format.whole(2_000_000)).toBe("2,000,000");
  });

  it("a version 1 snapshot has no catalogue, so maize-grain is Maize grain, and maize grain inside a sentence; a list names each crop once", () => {
    const names = cropNamesOf(variant("several_crops"));
    expect(names.name(crop("maize-grain"))).toBe("Maize grain");
    expect(names.list([crop("maize-grain")])).toBe("maize grain");
    expect(names.list([crop("maize-grain"), crop("rice-paddy")])).toBe("maize grain and rice paddy");
    expect(names.list([crop("maize-grain"), crop("rice-paddy"), crop("maize-grain"), crop("common-bean-dry")])).toBe(
      "maize grain, rice paddy and common bean dry",
    );
    expect(cropNamesOf(shared("plan")).name(crop("synthetic-crop"))).toBe("Synthetic crop");
  });

  it("a version 2 snapshot names each crop by its frozen label, as written, inside a sentence too", () => {
    const names = cropNamesOf(variant("labels_several"));
    expect(names.name(crop("maize-grain"))).toBe("Maize (grain)");
    expect(names.name(crop("common-bean-dry"))).toBe("Common bean (dry grain)");
    expect(names.list([crop("maize-grain"), crop("rice-paddy"), crop("maize-grain"), crop("common-bean-dry")])).toBe(
      "Maize (grain), Rice (paddy) and Common bean (dry grain)",
    );
  });

  it("an id missing from the frozen catalogue keeps its readable name beside the labelled ones", () => {
    const names = cropNamesOf(variant("labels_changed"));
    expect(names.name(crop("synthetic-old"))).toBe("Synthetic old");
    expect(names.list([crop("synthetic-old"), crop("synthetic-crop")])).toBe("synthetic old and Example grain (dry)");
  });

  it("ordinal turns a 0-based position into words: first, second, twelfth, then number 13", () => {
    expect(ordinal(0)).toBe("first");
    expect(ordinal(1)).toBe("second");
    expect(ordinal(11)).toBe("twelfth");
    expect(ordinal(12)).toBe("number 13");
  });

  it("[R40] the afterHarvest line is singular for one day: The first day is the time after the synthetic crop harvest, before the field is free.", () => {
    const gap = planSpans(shared("plan").result.plan).find(span => span.kind === "open");
    if (gap?.kind !== "open" || gap.after === null) throw new Error("The plan fixture has an open span after its crop.");
    expect(timeline.afterHarvest(gap.afterHarvestDays, dayCount(gap.afterHarvestDays), cropNamesOf(shared("plan")).list([gap.after]))).toBe(
      "The first day is the time after the synthetic crop harvest, before the field is free.",
    );
    expect(timeline.afterHarvest(2, dayCount(2), "maize grain")).toBe(
      "The first 2 days are the time after the maize grain harvest, before the field is free.",
    );
  });

  it("[R29] failureWords has farmer words for every ServiceFailure code and none contains the code itself", () => {
    const codes = serviceFailureSchema.unwrap().shape.code.options;
    expect(codes.length).toBeGreaterThan(0);
    for (const code of codes) {
      expect(failureWords[code].length).toBeGreaterThan(0);
      expect(failureWords[code]).not.toContain(code);
      expect(failureWords[code]).not.toContain("_");
    }
  });
});
