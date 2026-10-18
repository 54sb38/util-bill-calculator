export const SPLIT_METHODS = ['by_days', 'equal', 'weights', 'custom'] as const;

export type SplitMethod = (typeof SPLIT_METHODS)[number];

export const SPLIT_METHOD_LABELS: Record<SplitMethod, string> = {
  by_days: 'By days stayed',
  equal: 'Equal split',
  weights: 'By weights',
  custom: 'Custom amounts',
};

export const CALC_ERROR_CODES = [
  'NO_PARTICIPANTS',
  'NO_DAYS',
  'CUSTOM_MISSING',
  'CUSTOM_SUM_MISMATCH',
] as const;

export type CalcErrorCode = (typeof CALC_ERROR_CODES)[number];
