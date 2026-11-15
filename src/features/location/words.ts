// Every farmer-facing word in F2, in one file. Tables keyed by a union are Records, so a new state fails the build here
// instead of showing nothing. Voice: short sentences, "you" and "your field", typographic apostrophes, no "will", no long
// dash, no claim that the weather is for the field. F1 owns "Where is your farm?", its lead and "Next: crops".
import { coordsText } from "./coordinates";
import type { Axis, CoordError } from "./coordinates";
import { limits } from "./outline";
import type { LngLat, SavedProblem, ShapeProblem } from "./outline";
import type { LocateFailure, Note, Notice, Outline, Phase, Place, Surface } from "./picker";
import type { Provider, SearchFailure } from "./provider";

/** The slot's own heading while marking, an h2 under F1's h1. */
export const heading: Record<Exclude<Phase, "finding">, string> = {
  box: "Put your field in the box",
  corners: "Fit the corners to your field",
};

export const lead = {
  box: "Tap your field on the map to move the box onto it. Then make the box fit, or drag a corner to fit your field’s shape.",
  corners: "Drag a corner to move it. Add a corner where the edge of your field bends.",
  plan: "Change the corners in the list below. The drawing follows.",
} as const;

/** With no key the box takes only positions, so it is named for one. */
export const searchBox: Record<Provider["kind"], { readonly form: string; readonly label: string; readonly placeholder: string; readonly hint: string }> = {
  ready: {
    form: "Find your village or town",
    label: "Village, town or area",
    placeholder: "For example: Indramayu",
    hint: "Type the name, then press Search or Enter. Or type a position, like -6.326, 108.32.",
  },
  missing: {
    form: "Find your farm by its position",
    label: "Position of your farm",
    placeholder: "For example: -6.326, 108.32",
    hint: "Type a position, like -6.326, 108.32, then press Search or Enter.",
  },
};

export const search = {
  go: "Search",
  clear: "Clear",
  noKeyName: "Searching by name isn’t set up on this site. Type a position, like -6.326, 108.32, or your field’s corners.",
  searching: "Searching…",
  found: (count: number) => count === 1 ? "1 place found. Choose it from the list." : `${count} places found. Choose one from the list.`,
  none: "No place found. Try the nearest town, or tap the globe.",
  nonePlan: "No place found. Try the nearest town, or type a position.",
  short: "Type at least 2 letters, then Search.",
  unclearPosition: "We couldn’t read this as a position. Type it like -6.326, 108.32, then press Search.",
  list: "Places",
} as const;

export const searchFailed: Record<SearchFailure, string> = {
  offline: "We couldn’t reach the place search. Check your internet connection, then press Search again. You can also type a position or your field’s corners.",
  slow: "The place search took too long. Press Search again, or type a position.",
  refused: "The place search isn’t working on this site right now. Type a position, like -6.326, 108.32, or your field’s corners.",
  busy: "The place search is busy. Wait a moment, then press Search again.",
};

export const find = {
  useLocation: "Use my location",
  tapHint: "Or turn the globe and tap near your farm.",
  typeCorners: "Type your field’s corners instead",
  markField: "Mark my field",
  backToField: "Back to my field",
} as const;

export const locate = {
  title: "Use your location",
  stand: "Stand in your field if you can.",
  allow: "Next, your phone asks to share your location. Tap Allow. We use it once, to find your field.",
  go: "Find my location",
  finding: "Finding you…",
  findingSaid: "Finding you. This can take up to 15 seconds outdoors.",
  tryAgain: "Try again",
  close: "Close",
  turnOn: "To turn location on",
} as const;

interface LocateWords {
  readonly title: string;
  readonly body: string;
  readonly steps: readonly string[];
}

/** Timeout and unavailable read the same. With no key there is no search by name to fall back on. */
export function locateFailed(why: LocateFailure, provider: Provider["kind"]): LocateWords {
  if (why !== "timeout" && why !== "unavailable") return locateBlocked[why];
  const instead = provider === "ready" ? "search by name" : "type a position";
  return { title: "We couldn’t find you yet", body: `GPS works best outdoors, away from tall buildings and trees. You can also close this and ${instead}.`, steps: [] };
}

const locateBlocked: Record<Exclude<LocateFailure, "timeout" | "unavailable">, LocateWords> = {
  denied: {
    title: "Your location is turned off",
    body: "We can’t see where you are, so we can’t find your farm this way.",
    steps: [
      "Tap the small icon beside the web address at the top of the screen.",
      "Tap Location, then Allow.",
      "Come back here and tap Try again.",
    ],
  },
  unsupported: {
    title: "This phone can’t share its location here",
    body: "Search for your farm, type a position, or type your field’s corners.",
    steps: [],
  },
};

export const map = {
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  globe: "Globe. Drag to turn it, use the Zoom in and Zoom out buttons, and tap near your farm to put the pin there.",
  box: "Map of your field. Drag to move the map. Tap your field to move the box there, or drag a corner to fit your field’s shape. To use the keyboard, choose Type the corners.",
  corners: "Map of your field. Drag a corner to move it. To use the keyboard, choose Type the corners.",
  plan: "Drawing of your field, north at the top. It is a drawing, not a photo.",
  planTag: "A drawing, not a photo",
  north: "N",
  /** The scale bar: a round length, "50 m" or "2 km". */
  scale: (metres: number) => metres < 1000 ? `${metres} m` : `${(metres / 1000).toLocaleString("en")} km`,
  loading: "Loading the globe…",
} as const;

const addCorner = "Add a corner";
const removeCorner = (n: number) => `Remove corner ${n}`;

export const mark = {
  searchAgain: "Search again",
  typeCorners: "Type the corners",
  smaller: "Smaller",
  bigger: "Bigger",
  addCorner,
  removeCorner,
  chooseCorner: "Tap a corner to choose it.",
  status: (areaM2: number, corners: number) => `Your field is marked: ${lowerFirst(areaText(areaM2))}, ${corners} corners.`,
} as const;

export const list = {
  title: "Type the corners of your field",
  hint: "Go round the field in order. Use degrees with decimals, from your phone’s map or GPS. Latitude: minus or S for south. Longitude: minus or W for west.",
  corner: (n: number) => `Corner ${n}`,
  latitude: "Latitude",
  longitude: "Longitude",
  add: addCorner,
  remove: removeCorner,
  atMost: `A field can have up to ${limits.corners} corners.`,
  use: "Use these corners",
  close: "Close",
  saved: (n: number) => `Your field now has the ${n} corners you typed.`,
} as const;

export const coordError: Record<Axis, Record<CoordError, string>> = {
  latitude: {
    empty: "Type the latitude.",
    not_number: "Type a number, like -6.326.",
    wrong_letter: "Use N or S for latitude.",
    sign_and_letter: "Use a minus sign or a letter, not both.",
    out_of_range: "Latitude goes from -90 to 90.",
    minutes: "Minutes and seconds go from 0 to 59.",
  },
  longitude: {
    empty: "Type the longitude.",
    not_number: "Type a number, like 108.32.",
    wrong_letter: "Use E or W for longitude.",
    sign_and_letter: "Use a minus sign or a letter, not both.",
    out_of_range: "Longitude goes from -180 to 180.",
    minutes: "Minutes and seconds go from 0 to 59.",
  },
};

export const problemTyped: Record<ShapeProblem, string> = {
  too_few: "A field needs at least 3 corners.",
  too_many: `A field can have up to ${limits.corners} corners. Remove some first.`,
  pole: "We can’t mark a field this close to the North or South Pole. Check the latitude.",
  repeated: "Two corners in a row are in the same spot. Change one or remove it.",
  crossing: "Two sides cross. Type the corners in order, going around the field.",
  no_inside: "We couldn’t find a point inside these corners. Check the numbers.",
  too_far: `These corners are more than ${limits.maxSpanM / 1000} km apart. Check the numbers.`,
  tiny: "These corners don’t make a field. Check the numbers.",
};

/** Why an edit on the map was not kept. The corner goes back, and this says so. */
export const problemOnMap: Record<ShapeProblem, string> = {
  too_few: "A field needs at least 3 corners, so that corner stays.",
  too_many: `A field can have up to ${limits.corners} corners.`,
  pole: "We can’t mark a field this close to the North or South Pole, so the field stayed where it was.",
  repeated: "Two corners would be in the same spot, so the corner went back.",
  crossing: "Two sides would cross, so the corner went back.",
  no_inside: "That would leave no field, so the corner went back.",
  too_far: `The corners would be more than ${limits.maxSpanM / 1000} km apart, so the corner went back.`,
  tiny: "That would leave no field, so the corner went back.",
};

/** Each names a way that still works. */
export function noticeWords(notice: Notice): string {
  switch (notice.kind) {
    case "no_key": return "Search by name and close-up pictures aren’t set up on this site. Type a position, use your location, or type your field’s corners.";
    case "no_globe": return noGlobe[notice.why];
    case "no_pictures": return "The map pictures didn’t load. Check your internet connection. You can still mark your field, or type its corners.";
    case "still_marked": return `Your field is still marked: ${notice.label}. Mark your field at a new place to replace it.`;
    case "refused": return problemOnMap[notice.problem];
    case "saved_unusable": return savedUnusable(notice.problem);
  }
}

function savedUnusable(problem: SavedProblem): string {
  if (problem === "label") return "We couldn’t use the field you saved, because its name is empty or too long. Mark your field again.";
  return `We couldn’t draw the field you saved. ${problemTyped[problem]} Mark your field again.`;
}

const noGlobe: Record<Extract<Notice, { kind: "no_globe" }>["why"], string> = {
  no_webgl: "This phone can’t show the moving globe. Search for your farm, type a position or use your location, then check your field in the drawing or type its corners.",
  lost: "The globe stopped working on this phone. You can keep marking your field in the drawing, or type its corners.",
  failed: "The globe could not start on this device. Search for your farm, type a position or use your location, then check your field in the drawing or type its corners.",
};

/** The live region's sentence for each note. The same note also shows in place. */
export function noteWords(note: Note, outline: Outline | null, surface: Surface["kind"]): string {
  switch (note.kind) {
    case "place": return `${placeLine(note.place)} chosen.`;
    case "marked": return outline ? mark.status(outline.marked.areaM2, outline.marked.corners.length) : "";
    case "typed": return list.saved(note.corners);
    case "size_end": return sizeEnd(note.step, surface);
    case "refused": return note.from === "typed" ? problemTyped[note.problem] : problemOnMap[note.problem];
    case "saved_unusable": return noticeWords({ kind: "saved_unusable", problem: note.problem });
  }
}

/** The drawing has no corners to drag: the corner list changes it. */
function sizeEnd(step: -1 | 1, surface: Surface["kind"]): string {
  const [end, way] = step < 0 ? ["smallest", "smaller"] : ["biggest", "bigger"];
  const how = surface === "plan" ? "Type the corners in the list below" : "Drag a corner";
  return `This is the ${end} box. ${how} to make your field ${way}.`;
}

/** How the outline got where it is. weatherGrid always follows it, so it never suggests field-level weather. */
export function precisionWords(outline: Outline): string {
  const { made, place } = outline;
  switch (made.kind) {
    case "box": return made.on === "tap" || place === null ? "The box is at the spot you tapped." : boxOn(place);
    case "drawn": return "You placed the corners on the map.";
    case "typed": return "These are the corners you typed.";
    case "saved": return "This is the field you marked before.";
  }
}

function boxOn(place: Place): string {
  switch (place.kind) {
    case "found": return `From your search: the box is at the middle of ${place.name}, not on your field yet.`;
    case "position": return "The box is at the position you typed, not on your field yet.";
    case "tapped": return "The box is at the spot you tapped.";
    case "gps": return `From your phone’s location, within about ${roundAccuracy(place.accuracyM)} m.`;
    case "saved": return "The box is where your saved field was.";
  }
}

export const weatherDot = "The dot inside your field is the point we use to look up the weather records.";

export const weatherGrid = "Weather comes from NASA records on a grid much larger than a field. Every farm in the same grid square shares the same records, so marking your field more exactly doesn’t make the weather records finer.";

/** A credit link's name: it opens a new tab, so the slot stays where it was. */
export const newTab = (name: string) => `${name} (opens in a new tab)`;

/** Keyed by the provider, so what it says about who sees what is true for each. */
export const credits: Record<Provider["kind"], { readonly lead: string; readonly privacy: string }> = {
  missing: {
    lead: "Map pictures:",
    privacy: "The map pictures come from NASA, so NASA can see which area you are looking at.",
  },
  ready: {
    lead: "Map pictures and place search:",
    privacy: "The map pictures and the place search come from NASA and MapTiler, so they can see which area you are looking at and the names you search for.",
  },
};

export function areaText(areaM2: number): string {
  const hectares = areaM2 / 10_000;
  const shown = hectares < 1 ? Math.round(hectares * 100) / 100 : hectares < 10 ? Math.round(hectares * 10) / 10 : Math.round(hectares);
  if (shown === 0) return "Less than 0.01 hectares";
  if (shown === 0.25) return "About a quarter hectare";
  if (shown === 0.5) return "About half a hectare";
  return `About ${shown.toLocaleString("en")} ${shown === 1 ? "hectare" : "hectares"}`;
}

export function acrossText(spanM: number): string {
  const step = spanM < 10 ? 1 : spanM < 100 ? 5 : 10;
  const metres = Math.max(1, Math.round(spanM / step) * step);
  if (metres < 1000) return `${metres} m across`;
  const kilometres = metres < 10_000 ? Math.round(metres / 100) / 10 : Math.round(metres / 1000);
  return `${kilometres.toLocaleString("en")} km across`;
}

/** The place card and the notes: "Indramayu, West Java, Indonesia", the saved label, or "6.327° S, 108.320° E". */
export function placeLine(place: Place): string {
  switch (place.kind) {
    case "found": return place.where ? `${place.name}, ${place.where}` : place.name;
    case "saved": return place.label;
    case "position":
    case "tapped":
    case "gps": return coordsText(place.at, 3);
  }
}

/** The names of a field the farmer made. picker.ts labelFor chooses between them. */
export function fieldNear(place: Place): string {
  return `Field near ${placeLine(place)}`;
}

export function fieldAt(lookup: LngLat): string {
  return `Field at ${coordsText(lookup, 2)}`;
}

function roundAccuracy(accuracyM: number): number {
  return accuracyM < 10 ? Math.max(1, Math.round(accuracyM)) : Math.round(accuracyM / 5) * 5;
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}
