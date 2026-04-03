export const TIERS = {
    beta: { matchLimit: 10, requiresPayment: false },
    free: { matchLimit: 10, requiresPayment: false },
    paid: { matchLimit: 500, requiresPayment: true },
};
export const BETA_CODES = new Set(["BETA-001", "BETA-002", "BETA-003"]);
