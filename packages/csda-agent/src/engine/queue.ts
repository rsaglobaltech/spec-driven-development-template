/**
 * A one-producer / one-consumer async queue.
 *
 * The engine needs to interleave two sources into one event stream: messages
 * coming out of the SDK's iterator, and permission requests arriving through
 * the `canUseTool` callback the SDK *calls into*. A generator can only await
 * one of those at a time, so both push here and the generator drains it.
 */

export class AsyncQueue<T> {
  private readonly items: T[] = [];
  private waiting: ((value: IteratorResult<T>) => void) | null = null;
  private closed = false;

  push(item: T): void {
    if (this.closed) return;
    if (this.waiting) {
      const resolve = this.waiting;
      this.waiting = null;
      resolve({ value: item, done: false });
      return;
    }
    this.items.push(item);
  }

  /** No more items will be pushed; the consumer drains what is left and ends. */
  close(): void {
    this.closed = true;
    if (this.waiting) {
      const resolve = this.waiting;
      this.waiting = null;
      resolve({ value: undefined as never, done: true });
    }
  }

  async *drain(): AsyncIterableIterator<T> {
    while (true) {
      if (this.items.length > 0) {
        yield this.items.shift() as T;
        continue;
      }
      if (this.closed) return;
      const next = await new Promise<IteratorResult<T>>((resolve) => {
        this.waiting = resolve;
      });
      if (next.done) return;
      yield next.value;
    }
  }
}

/** A promise whose resolution is handed to someone else. */
export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

export function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}
