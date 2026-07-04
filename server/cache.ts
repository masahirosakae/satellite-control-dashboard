/** In-memory TTL cache. Keeps expired entries so callers can serve them as an explicit STALE fallback. */

interface Entry<T> {
  value: T;
  storedAt: number;
}

export class TtlCache<T> {
  private map = new Map<string, Entry<T>>();

  constructor(private ttlMs: number, private now: () => number = Date.now) {}

  set(key: string, value: T): void {
    this.map.set(key, { value, storedAt: this.now() });
  }

  /** Only returns entries younger than the TTL. */
  getFresh(key: string): T | null {
    const e = this.map.get(key);
    if (!e) return null;
    return this.now() - e.storedAt <= this.ttlMs ? e.value : null;
  }

  /** Returns any entry (including expired), tagged with its age. */
  getAny(key: string): { value: T; ageS: number; stale: boolean } | null {
    const e = this.map.get(key);
    if (!e) return null;
    const ageMs = this.now() - e.storedAt;
    return { value: e.value, ageS: Math.round(ageMs / 1000), stale: ageMs > this.ttlMs };
  }
}
