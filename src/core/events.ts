/** Tiny synchronous event emitter — the only coupling between modules. */

type Listener<T> = (payload: T) => void;

/**
 * `E` maps event names to payload types. Events whose payload type includes
 * `undefined` (e.g. `miss: undefined`) can be emitted without a payload.
 */
export class Emitter<E extends Record<string, unknown> = Record<string, unknown>> {
  #listeners = new Map<keyof E, Set<Listener<never>>>();

  on<K extends keyof E>(event: K, fn: Listener<E[K]>): () => void {
    if (!this.#listeners.has(event)) this.#listeners.set(event, new Set());
    this.#listeners.get(event)!.add(fn as Listener<never>);
    return () => this.off(event, fn);
  }

  off<K extends keyof E>(event: K, fn: Listener<E[K]>): void {
    this.#listeners.get(event)?.delete(fn as Listener<never>);
  }

  emit<K extends keyof E>(
    event: K,
    ...args: undefined extends E[K] ? [payload?: E[K]] : [payload: E[K]]
  ): void {
    const set = this.#listeners.get(event);
    if (!set) return;
    for (const fn of set) (fn as Listener<E[K]>)(args[0] as E[K]);
  }
}
