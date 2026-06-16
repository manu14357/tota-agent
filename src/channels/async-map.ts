/**
 * A keyed async map for channel-internal pending resolvers (approvals,
 * permission-mode replies, ask-to-continue). The map associates a key
 * (often a JID, chat id, or composite id) with a callback.
 *
 * `clearAll()` invokes an optional callback for each entry and clears
 * the map. This is critical for the connection-close path: if the
 * socket drops, all in-flight approvals must time out immediately
 * rather than leak their timers and possibly resolve against a future
 * (unrelated) user message.
 */
export class AsyncMap<K, V> {
  private map = new Map<K, V>();

  set(key: K, value: V): void {
    this.map.set(key, value);
  }

  get(key: K): V | undefined {
    return this.map.get(key);
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  delete(key: K): boolean {
    return this.map.delete(key);
  }

  size(): number {
    return this.map.size;
  }

  keys(): IterableIterator<K> {
    return this.map.keys();
  }

  values(): IterableIterator<V> {
    return this.map.values();
  }

  entries(): IterableIterator<[K, V]> {
    return this.map.entries();
  }

  /**
   * M3 / M4: Clear all entries and invoke `onClear(key, value)` for each.
   * Use this on socket disconnect so any in-flight approval timers don't
   * leak AND the awaiting Promise resolves immediately rather than
   * potentially matching a future user message.
   */
  clearAll(onClear?: (key: K, value: V) => void): void {
    if (onClear) {
      for (const [k, v] of this.map.entries()) {
        onClear(k, v);
      }
    }
    this.map.clear();
  }
}
