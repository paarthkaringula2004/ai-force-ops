"use client";
import { useState } from "react";
import ThemedSelect from "@/components/themed-select";
export default function SalarySettings({ userId, name }: { userId: string; name: string }) {
    const [open, setOpen] = useState(false),
        [amount, setAmount] = useState(""),
        [currency, setCurrency] = useState("INR"),
        [basis, setBasis] = useState("calendar_days"),
        [note, setNote] = useState(""),
        [version, setVersion] = useState<string | undefined>(),
        [busy, setBusy] = useState(false),
        [error, setError] = useState(""),
        [notice, setNotice] = useState("");
    const field = "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm";
    async function load() {
        setBusy(true);
        setError("");
        try {
            const r = await fetch(`/api/workspace/salary?userId=${encodeURIComponent(userId)}`, {
                    cache: "no-store",
                }),
                data = await r.json();
            if (!r.ok) throw new Error(data.error);
            setAmount(data.salary?.monthly_salary || "");
            setCurrency(data.salary?.currency || "INR");
            setBasis(data.salary?.deduction_basis || "calendar_days");
            setVersion(data.salary?.version);
            setOpen(true);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(false);
        }
    }
    async function save() {
        setBusy(true);
        setError("");
        try {
            const r = await fetch("/api/workspace/salary", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        userId,
                        monthlySalary: Number(amount),
                        currency,
                        deductionBasis: basis,
                        note,
                        version,
                    }),
                }),
                data = await r.json();
            if (!r.ok) throw new Error(data.error);
            setOpen(false);
            setNote("");
            setNotice(data.notice);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(false);
        }
    }
    return (
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <button
                type="button"
                disabled={busy}
                onClick={() => void load()}
                className="text-xs font-medium text-indigo-700"
            >
                {busy ? "Loading…" : `Salary & leave deductions · ${name}`}
            </button>
            {open && (
                <div className="mt-3 space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="text-xs">
                            Monthly salary
                            <input
                                type="number"
                                min="0.01"
                                step="0.01"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                className={field}
                            />
                        </label>
                        <label className="text-xs">
                            Currency
                            <input
                                maxLength={3}
                                value={currency}
                                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                                className={field}
                            />
                        </label>
                    </div>
                    <label className="block text-xs">
                        Company deduction basis
                        <ThemedSelect
                            value={basis}
                            onChange={(e) => setBasis(e.target.value)}
                            className={field}
                        >
                            <option value="calendar_days">Actual calendar days in the month</option>
                            <option value="fixed_30">Fixed 30-day payroll basis</option>
                        </ThemedSelect>
                    </label>
                    <p className="text-xs leading-5 text-slate-500">
                        Monthly salary ÷ selected divisor × approved unpaid days. Match your
                        company’s payroll policy. Base salary is preserved; deductions are recorded
                        separately.
                    </p>
                    <label className="block text-xs">
                        Change note
                        <input
                            value={note}
                            maxLength={1000}
                            onChange={(e) => setNote(e.target.value)}
                            className={field}
                        />
                    </label>
                    <div className="flex gap-3">
                        <button
                            type="button"
                            disabled={busy || !amount || !note.trim()}
                            onClick={() => void save()}
                            className="rounded-lg bg-indigo-600 px-3 py-2 text-xs text-white disabled:opacity-40"
                        >
                            Save salary settings
                        </button>
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => setOpen(false)}
                            className="text-xs"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}
            {error && (
                <p role="alert" className="mt-2 text-xs text-rose-700">
                    {error}
                </p>
            )}
            {notice && (
                <p role="status" className="mt-2 text-xs text-indigo-700">
                    {notice}
                </p>
            )}
        </div>
    );
}
