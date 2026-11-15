// F1's server-safe public file, for src/app/layout.tsx (a server component). It cannot come from index.tsx: that
// module is "use client", and a value a server component imports from a client module arrives as a reference, not as
// the string.
import { shell } from "./model/words";

export { readingHeadScript } from "./services/reading";
export const skipLink = shell.skip;
