/** Simple in-memory fixed window. Returns true if allowed. */
export function createMemoryRateLimit() {
  const buckets = new Map();
  return {
    hit(bucketKey, windowMs, maxHits, now = Date.now()) {
      const current = buckets.get(bucketKey);
      if (!current || now - current.started >= windowMs) {
        buckets.set(bucketKey, { started: now, count: 1 });
        return true;
      }
      if (current.count >= maxHits) return false;
      current.count += 1;
      return true;
    },
  };
}

export const sharedRateLimit = createMemoryRateLimit();
