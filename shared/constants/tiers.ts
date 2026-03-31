export const TIERS = {
  beta: { matchLimit: 10, requiresPayment: false },
  free: { matchLimit: 10, requiresPayment: false },
  paid: { matchLimit: 500, requiresPayment: true },
} as const;

export const BETA_CODES: Set<string> = new Set(["BETA-001", "BETA-002", "BETA-003"]);
