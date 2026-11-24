import type { JobStatus } from "@prospectra/shared";

export type JobHandler = (payload: unknown) => Promise<void>;

export type JobRunner = {
  register: (jobType: string, handler: JobHandler) => void;
  listRegisteredTypes: () => string[];
  getHandler: (jobType: string) => JobHandler | undefined;
  stop: () => void;
  isStopped: () => boolean;
  getStatusPlaceholder: () => JobStatus;
};

export function createJobRunner(): JobRunner {
  const handlers = new Map<string, JobHandler>();
  let stopped = false;

  return {
    register(jobType, handler) {
      if (handlers.has(jobType)) {
        throw new Error(`Job type already registered: ${jobType}`);
      }
      handlers.set(jobType, handler);
    },
    listRegisteredTypes() {
      return [...handlers.keys()].sort();
    },
    getHandler(jobType) {
      return handlers.get(jobType);
    },
    stop() {
      stopped = true;
    },
    isStopped() {
      return stopped;
    },
    getStatusPlaceholder() {
      return "pending";
    },
  };
}
