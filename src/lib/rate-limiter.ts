import { Redis } from "@upstash/redis";

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

// ─── Redis-backed rate limiter (distributed, works across instances) ─

let redis: Redis | null = null;
try {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    redis = Redis.fromEnv();
  }
} catch {
  // Redis not available, fall back to memory
}

if (!redis) {
  console.warn(
    "[rate-limiter] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set. " +
    "Using in-memory rate limiter — limits are NOT shared across instances."
  );
}

async function checkRateLimitRedis(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const windowKey = `rl:${key}:${Math.floor(Date.now() / windowMs)}`;

  const pipe = redis!.pipeline();
  pipe.incr(windowKey);
  pipe.pexpire(windowKey, windowMs);
  const results = await pipe.exec<[number, number]>();

  const count = results[0];
  const resetAt = (Math.floor(Date.now() / windowMs) + 1) * windowMs;

  if (count > limit) {
    return { allowed: false, remaining: 0, resetAt };
  }

  return { allowed: true, remaining: limit - count, resetAt };
}

// ─── In-memory fallback (single instance only) ─────────────────────

const windows = new Map<string, { count: number; resetAt: number }>();

function checkRateLimitMemory(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const existing = windows.get(key);

  if (!existing || now >= existing.resetAt) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  if (existing.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count++;
  return {
    allowed: true,
    remaining: limit - existing.count,
    resetAt: existing.resetAt,
  };
}

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of windows) {
    if (now >= value.resetAt) {
      windows.delete(key);
    }
  }
}, 60_000);

// ─── Public API ────────────────────────────────────────────────────

export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number = 60_000
): Promise<RateLimitResult> {
  if (redis) {
    try {
      return await checkRateLimitRedis(key, limit, windowMs);
    } catch (err) {
      console.error("[rate-limiter] Redis error, falling back to memory:", err);
    }
  }
  return checkRateLimitMemory(key, limit, windowMs);
}
