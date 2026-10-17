export const MEMBERSHIP_PLANS = {
    monthly: { name: "Monthly membership", instant: 1000, daily: 50, days: 30, price: 799 },
    weekly: { name: "Weekly membership", instant: 200, daily: 30, days: 7, price: 159 },
    lite: { name: "Weekly membership lite", instant: 20, daily: 10, days: 7, price: 50 },
} as const;
export type MembershipPlan = keyof typeof MEMBERSHIP_PLANS;
