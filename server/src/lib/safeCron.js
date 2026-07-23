import cron from 'node-cron';

/**
 * Wraps a cron job's callback so a thrown error or rejected promise is
 * logged and swallowed, never left to bubble up. node-cron does not await
 * or catch what its callback returns — and as of Node 15+, an unhandled
 * promise rejection terminates the entire process by default (confirmed
 * empirically against the Node version this app runs on). Without this
 * wrapper, a single transient database hiccup in any scheduled job would
 * crash the whole server, taking every user's traffic down with it, not
 * just that one background job.
 *
 * Per-item try/catch inside an agent (see dailyScoresAgent/goalsAgent) is
 * still valuable on top of this — it keeps one bad row from stopping the
 * rest of a batch. This wrapper is the outer safety net for everything
 * else: the initial query, a connection failure, a bug we haven't hit yet.
 */
export function scheduleSafeCron(expression, name, fn, options) {
  return cron.schedule(
    expression,
    async () => {
      try {
        await fn();
      } catch (err) {
        console.error(`[${name}] job failed — skipped this run, server stays up:`, err);
      }
    },
    options
  );
}
