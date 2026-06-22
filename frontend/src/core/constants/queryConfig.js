/**
 * Shared staleTime constants for React Query.
 * Use these instead of magic numbers so intent is clear across modules.
 */
export const STALE = {
  /** Real-time / very frequently changing data (10 s). */
  LIVE: 10_000,
  /** Standard data that changes throughout the day (30 s). */
  SHORT: 30_000,
  /** Moderately changing data — order lists, session data (1 min). */
  MEDIUM: 60_000,
  /** Catalog / reference data that rarely changes mid-session (2 min). */
  CATALOG: 2 * 60_000,
  /** Per-session / session-bound data (5 min — matches QueryClient default). */
  DEFAULT: 5 * 60_000,
  /** Stable master data that almost never changes (10 min). */
  LONG: 10 * 60_000,
}
