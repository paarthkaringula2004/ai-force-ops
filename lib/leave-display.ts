const internalFields = new Set([
    "leaveAllocations",
    "leaveStart",
    "leaveEnd",
    "halfDay",
    "leaveDays",
    "leavePolicy",
    "leaveMailSubject",
    "leaveMailBody",
    "payrollEstimate",
    "payrollDeduction",
    "approvalRoute",
    "monthlyPaidRemaining",
]);
export function readableRequestDetails(details: Record<string, string>) {
    return Object.entries(details).filter(([key]) => !internalFields.has(key));
}
export function leaveDeductionSummary(details: Record<string, string>) {
    try {
        const rows = JSON.parse(details.payrollDeduction || details.payrollEstimate || "[]");
        if (!Array.isArray(rows)) return "";
        return rows
            .filter((item) => item.unpaidDays > 0 && Number.isFinite(Number(item.deduction)))
            .map(
                (item) =>
                    `${item.month}: ${item.currency} ${Number(item.deduction).toFixed(2)} ${details.payrollDeduction ? "recorded for payroll" : "estimated"} (${item.unpaidDays} unpaid days)`,
            )
            .join("; ");
    } catch {
        return "";
    }
}
