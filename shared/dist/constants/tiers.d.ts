export declare const TIERS: {
    readonly beta: {
        readonly matchLimit: 10;
        readonly requiresPayment: false;
    };
    readonly free: {
        readonly matchLimit: 10;
        readonly requiresPayment: false;
    };
    readonly paid: {
        readonly matchLimit: 500;
        readonly requiresPayment: true;
    };
};
export declare const BETA_CODES: Set<string>;
