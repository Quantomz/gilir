import { NotImplementedError } from "@/contracts/common";
import type { JobStore } from "@/contracts/jobs";

export const jobStore: JobStore = {
  async purgeExpired() { throw new NotImplementedError("Expired job cleanup"); },
  async create() { throw new NotImplementedError("Job creation"); },
  async get() { throw new NotImplementedError("Job retrieval"); },
  async delete() { throw new NotImplementedError("Job deletion"); },
  async claim() { throw new NotImplementedError("Job claim"); },
  async renew() { throw new NotImplementedError("Job lease renewal"); },
  async freeze() { throw new NotImplementedError("Freezing a job"); },
  async complete() { throw new NotImplementedError("Job completion"); },
  async fail() { throw new NotImplementedError("Recording job failure"); },
};
