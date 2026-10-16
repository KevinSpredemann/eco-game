/** Alcances do combate. Nenhum poder novo é global só porque o mapa cresceu. */
export const RANGE_TIER = {
  short: 140,
  medium: 260,
  long: 380,
  extreme: 560,
} as const;

export type RangeTier = keyof typeof RANGE_TIER;

export function rangeTier(range: number): RangeTier {
  if (range <= RANGE_TIER.short) return 'short';
  if (range <= RANGE_TIER.medium) return 'medium';
  if (range <= RANGE_TIER.long) return 'long';
  return 'extreme';
}
