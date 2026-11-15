import type { LaunchOptions } from "@playwright/test";

/** PW_CHROMIUM names a Chromium for a machine where Playwright cannot find its own. Unset, Playwright uses its own. */
export const launchOptions: LaunchOptions = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};
