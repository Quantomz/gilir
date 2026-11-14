// F1's server-safe public file, for src/app/layout.tsx (a server component).
// It cannot come from index.tsx: that module is "use client", and a value a server component imports from a client
// module arrives as a client reference, not as the string. No "use client" here, and nothing browser-only at load.
export { readingHeadScript } from "./services/reading";
