import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { z } from "zod";
import { jobStore } from "@/server/jobs";

export async function cleanupMain(): Promise<void> {
  z.url().parse(process.env.DATABASE_URL);
  const purged = await jobStore.purgeExpired(new Date().toISOString());
  process.stdout.write(JSON.stringify({ event: "expired_jobs_purged", count: purged }) + "\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  cleanupMain().catch(() => {
    process.stderr.write(JSON.stringify({ event: "cleanup_failed" }) + "\n");
    process.exitCode = 1;
  });
}
