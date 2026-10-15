/**
 * Runs `task` one at a time. A request that arrives while a run is in flight
 * does not start a second one: it marks one follow-up, started when the
 * current run settles (resolved or rejected), however many requests came in.
 * The task reads the latest inputs itself, so the follow-up sees them all.
 */
export function createLatestOnly(task: () => Promise<void>): { request(): void } {
  let running = false;
  let pending = false;

  const start = () => {
    running = true;
    pending = false;
    const settle = () => {
      running = false;
      if (pending) start();
    };
    // expected: the task reports its own failures; a rejection only ends this run so the follow-up can start
    task().then(settle, settle);
  };

  return {
    request() {
      if (running) pending = true;
      else start();
    },
  };
}
