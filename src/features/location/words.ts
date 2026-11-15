// Every farmer-facing word in F2, in one file. Ported from the prototype's page 1 (threefield-web src/app.js: Farm,
// Search, PlaceCard, GpsSheet, CornersSheet, SizeCtl, parseCoord, cornersField, areaText, sideText, fieldLabel; Help's
// weather square answer; map.js fallback), read by function name. Changed only where the box became an editable
// outline, where the repo has no reverse geocoder, voice or Help page, or where a known issue is fixed.
// Tables keyed by a union are Records, so a new state fails the build here instead of showing nothing.
// Voice (conventions.test.ts and words.test.ts): short sentences, "you" and "your field", typographic apostrophes, no
// "will", no long dash, no claim that the weather is for the field. F1 owns "Where is your farm?", its lead and
// "Next: crops"; nothing here repeats them.
import { coordsText } from "./coordinates";
import type { Axis, CoordError } from "./coordinates";
import { limits, metresBetween } from "./outline";
import type { LngLat, ShapeProblem } from "./outline";
import type { LocateFailure, Note, Notice, Outline, Phase, Place } from "./picker";
import type { Provider, SearchFailure } from "./provider";

/** The slot's own heading while marking (an h2 under F1's h1). It takes focus when marking starts. */
export const heading: Record<Exclude<Phase, "finding">, string> = {
  box: "Put your field in the box",                      // prototype
  corners: "Fit the corners to your field",
};

export const lead = {
  box: "Tap your field on the map to move the box onto it. Then make the box fit.",
  corners: "Drag a corner to move it. Add a corner where the edge of your field bends.",
  plan: "Change the corners in the list below. The drawing follows.",
} as const;

export const search = {
  form: "Find your village or town",                     // the form's name
  label: "Village, town or area",
  placeholder: "For example: Indramayu",
  go: "Search",
  clear: "Clear",
  hint: "Type the name, then press Search or Enter. Or type a position, like -6.326, 108.32.",
  hintNoKey: "Type a position, like -6.326, 108.32, then press Search or Enter.",
  noKeyName: "Searching by name isn’t set up on this site. Type a position, like -6.326, 108.32, or your field’s corners.",
  searching: "Searching…",
  found: (count: number) => count === 1 ? "1 place found. Choose it from the list." : `${count} places found. Choose one from the list.`,
  none: "No place found. Try the nearest town, or tap the globe.",
  nonePlan: "No place found. Try the nearest town, or type a position.",
  short: "Type at least 2 letters, then Search.",
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

/** "Use my location": the prototype's sheet, shown in place. The fix stays on the phone, so "once" stays true. */
export const locate = {
  title: "Use your location",
  stand: "Stand in your field if you can.",
  allow: "Next, your phone asks to share your location. Tap Allow. We use it once, to find your field.",
  go: "Find my location",
  finding: "Finding you…",
  findingSaid: "Finding you. This can take up to 15 seconds outdoors.",
  tryAgain: "Try again",
  close: "Close",
} as const;

export const locateFailed: Record<LocateFailure, { readonly title: string; readonly body: string; readonly steps: readonly string[] }> = {
  timeout: {
    title: "We couldn’t find you yet",
    body: "GPS works best outdoors, away from tall buildings and trees. You can also close this and search by name.",
    steps: [],
  },
  unavailable: {
    title: "We couldn’t find you yet",
    body: "GPS works best outdoors, away from tall buildings and trees. You can also close this and search by name.",
    steps: [],
  },
  denied: {
    title: "Your location is turned off",
    body: "We can’t see where you are, so we can’t find your farm this way.",
    steps: [
      "Tap the small lock beside the web address at the top of the screen.",
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
  box: "Map of your field. Drag to move the map. Tap your field to move the box there. To use the keyboard, choose Type the corners.",
  corners: "Map of your field. Drag a corner to move it. To use the keyboard, choose Type the corners.",
  plan: "Drawing of your field, north at the top. It is a drawing, not a photo.",
  planTag: "A drawing, not a photo",
  north: "N",
  weatherPoint: "Weather point",
  fieldPill: (areaM2: number) => `Your field: ${lowerFirst(areaText(areaM2))}`,
  loading: "Loading the globe…",
} as const;

export const mark = {
  searchAgain: "Search again",
  typeCorners: "Type the corners",
  smaller: "Smaller",
  bigger: "Bigger",
  addCorner: "Add a corner",
  removeCorner: (n: number) => `Remove corner ${n}`,
  chooseCorner: "Tap a corner to choose it.",
  status: (areaM2: number, corners: number) => `Your field is marked: ${lowerFirst(areaText(areaM2))}, ${corners} corners.`,
} as const;

/** The corner list (the prototype's "Type the corners" sheet, shown in place, with 3 to 256 corners). */
export const list = {
  title: "Type the corners of your field",
  hint: "Go round the field in order. Use degrees with decimals, from your phone’s map or GPS. Latitude: minus or S for south. Longitude: minus or W for west.",
  corner: (n: number) => `Corner ${n}`,
  latitude: "Latitude",
  longitude: "Longitude",
  add: "Add a corner",
  remove: (n: number) => `Remove corner ${n}`,
  atMost: `A field can have up to ${limits.corners} corners.`,
  use: "Use these corners",
  close: "Close",
  saved: (n: number) => `Your field now has the ${n} corners you typed.`,
} as const;

/** One typed number (prototype parseCoord). */
export const coordError: Record<Axis, Record<CoordError, string>> = {
  latitude: {
    empty: "Type the latitude.",
    not_number: "Type a number, like -6.326.",
    wrong_letter: "Use N or S for latitude.",
    sign_and_letter: "Use a minus sign or a letter, not both.",
    out_of_range: "Latitude goes from -90 to 90.",
  },
  longitude: {
    empty: "Type the longitude.",
    not_number: "Type a number, like 108.32.",
    wrong_letter: "Use E or W for longitude.",
    sign_and_letter: "Use a minus sign or a letter, not both.",
    out_of_range: "Longitude goes from -180 to 180.",
  },
};

/** Why typed corners are not a field (prototype cornersField, plus the cases a polygon adds). */
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

/** A visible explanation for each thing that is not available (docs/cards/F2.md:34). Each names a way that still works. */
export function noticeWords(notice: Notice): string {
  switch (notice.kind) {
    case "no_key": return "Search by name and close-up pictures aren’t set up on this site. Type a position, use your location, or type your field’s corners.";
    case "no_globe": return noGlobe[notice.why];
    case "no_pictures": return "The map pictures didn’t load. Check your internet connection. You can still mark your field, or type its corners.";
    case "still_marked": return `Your field is still marked: ${notice.label}. Mark your field at a new place to replace it.`;
    case "refused": return problemOnMap[notice.problem];
    case "saved_unusable": return `We couldn’t draw the field you saved. ${problemTyped[notice.problem]} Mark your field again.`;
  }
}

const noGlobe: Record<Extract<Notice, { kind: "no_globe" }>["why"], string> = {
  no_webgl: "This phone can’t show the moving globe. Search for your farm, type a position or use your location, then check your field in the drawing or type its corners.",
  lost: "The globe stopped working on this phone. You can keep marking your field in the drawing, or type its corners.",
  failed: "The globe could not start on this device. Search for your farm, type a position or use your location, then check your field in the drawing or type its corners.",
};

/** The live region's sentence for each note. The same note also shows in place. */
export function noteWords(note: Note, outline: Outline | null): string {
  switch (note.kind) {
    case "place": return `${placeLine(note.place)} chosen.`;
    case "marked": return outline ? mark.status(outline.marked.areaM2, outline.marked.corners.length) : "";
    case "typed": return list.saved(note.corners);
    case "size_end": return note.step < 0 ? "This is the smallest box. Drag a corner to make your field smaller." : "This is the biggest box. Drag a corner to make your field bigger.";
    case "refused": return note.from === "typed" ? problemTyped[note.problem] : problemOnMap[note.problem];
    case "saved_unusable": return noticeWords({ kind: "saved_unusable", problem: note.problem });
  }
}

/**
 * "Source location precision" (docs/cards/F2.md:33): how the outline got where it is. It never suggests the weather
 * becomes field-resolution: weatherGrid always follows it.
 */
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

/** Always shown with the precision sentence (spec.md:93: a precise boundary does not improve climate resolution). */
export const weatherGrid = "Weather comes from NASA records on a grid much larger than a field. Every farm in the same grid square shares the same records, so marking your field more exactly doesn’t make the weather records finer.";

/** The credits line's lead and what it tells the farmer about who sees what. Keyed by the provider, so each is true. */
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

// ---------------------------------------------------------------------------------------------------------------------
// Numbers into words
// ---------------------------------------------------------------------------------------------------------------------

/**
 * "About 1 hectare" (prototype areaText, metric only: spec.md:64). Never square metres and never more than two
 * decimals: under 1 ha two decimals, under 10 ha one, else whole hectares; "About a quarter hectare" and "About half
 * a hectare" for 0.25 and 0.5. The fixture's 1,194,276 m² reads "About 119 hectares".
 */
export function areaText(areaM2: number): string {
  throw new Error("not implemented");
}

/** "100 m across" (prototype sideText): to 5 m under 100 m, else to 10 m; from 1,000 m in kilometres, "1.5 km across". */
export function acrossText(spanM: number): string {
  throw new Error("not implemented");
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

/**
 * The field's label (prototype fieldLabel). "Field near {name, where}" for a found place within limits.nearPlaceM of
 * the lookup (the distance wraps across 180°, so a Fiji field is never named after Tonga); a saved place's own label
 * within the same distance; else "Field at 6.33° S, 108.32° E" (2 decimals). Cut to 240 code points with Array.from,
 * then trimmed, so it passes the contract's `labels` (src/contracts/common.ts:5) even with emoji in a place name.
 * The label is the only text from a place that leaves the browser, inside F1's submission.
 */
export function labelFor(place: Place | null, lookup: LngLat): string {
  throw new Error("not implemented");
  // TODO: uses metresBetween (imported above) and coordsText(lookup, 2)
}

function roundAccuracy(accuracyM: number): number {
  return accuracyM < 10 ? Math.max(1, Math.round(accuracyM)) : Math.round(accuracyM / 5) * 5;
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}
