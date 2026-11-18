import { BusyError } from "./ai/llm.js";

export type Queue = { run<T>(fn: () => Promise<T>): Promise<T>; depth(): number };

/** FIFO gate for the single GPU: `concurrency` jobs run, up to `cap` wait, the rest get BusyError. */
export function createQueue(concurrency: number, cap: number): Queue {
  let active = 0;
  const waiting: (() => void)[] = [];

  const next = () => {
    if (active < concurrency && waiting.length) {
      active++;
      waiting.shift()!();
    }
  };

  return {
    run<T>(fn: () => Promise<T>): Promise<T> {
      if (active >= concurrency && waiting.length >= cap) return Promise.reject(new BusyError("Too many memes in the queue."));
      return new Promise<T>((resolve, reject) => {
        waiting.push(() => {
          fn()
            .then(resolve, reject)
            .finally(() => {
              active--;
              next();
            });
        });
        next();
      });
    },
    depth: () => waiting.length,
  };
}
