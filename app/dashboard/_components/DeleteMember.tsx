"use client";
import { useState } from "react";
import { Trash2 } from "lucide-react";
export type DeletionFeedback = { success: boolean; message: string };
export default function DeleteMember({
    userId,
    email,
    updatedAt,
    viewerId,
    onDeleted,
    onFeedback,
}: {
    userId: string;
    email: string;
    updatedAt: string;
    viewerId: string;
    onDeleted: () => void;
    onFeedback: (feedback: DeletionFeedback) => void;
}) {
    const [open, setOpen] = useState(false),
        [confirmation, setConfirmation] = useState(""),
        [busy, setBusy] = useState(false),
        [error, setError] = useState("");
    if (userId === viewerId) return null;
    async function remove() {
        setBusy(true);
        setError("");
        try {
            const response = await fetch("/api/workspace/admin", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId, confirmation, updatedAt }),
            });
            const result = await response.json();
            if (!response.ok || result.deleted !== true)
                throw new Error(
                    result.error || "Deletion was not confirmed. Refresh to check the account.",
                );
            onFeedback({
                success: true,
                message: `${email} and its stored application data were deleted.`,
            });
            onDeleted();
        } catch (e) {
            const message =
                e instanceof Error
                    ? e.message
                    : "Could not confirm deletion. Refresh to check the account.";
            setError(message);
            onFeedback({ success: false, message });
        } finally {
            setBusy(false);
        }
    }
    const button =
        "inline-flex items-center gap-2 rounded-lg border border-rose-200 px-3 py-2 text-xs font-medium text-rose-700 transition hover:bg-rose-50 disabled:opacity-40";
    return (
        <div className="mt-4 border-t border-slate-100 pt-4">
            {open ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-4">
                    <p className="text-sm font-semibold text-rose-900">
                        Permanently delete this account?
                    </p>
                    <p className="mt-2 text-xs leading-5 text-rose-800">
                        This deletes the login, sessions, agents, tools, knowledge, requests,
                        tickets and stored workspace data. This cannot be undone. Other accounts
                        remain; direct reports will need a new manager. Existing external emails and
                        third-party systems are not erased.
                    </p>
                    <label className="mt-3 block text-xs text-rose-900">
                        Type <strong>{email}</strong> to confirm
                        <input
                            aria-label={`Confirm deletion of ${email}`}
                            autoComplete="off"
                            value={confirmation}
                            onChange={(e) => setConfirmation(e.target.value)}
                            className="mt-2 w-full rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-rose-200"
                        />
                    </label>
                    <div className="mt-3 flex flex-wrap gap-2">
                        <button
                            type="button"
                            disabled={busy || confirmation !== email}
                            onClick={() => void remove()}
                            className={`${button} bg-rose-600 text-white hover:bg-rose-700`}
                        >
                            {busy ? "Deleting…" : "Permanently delete account"}
                        </button>
                        <button
                            type="button"
                            disabled={busy}
                            className={button}
                            onClick={() => {
                                setOpen(false);
                                setConfirmation("");
                                setError("");
                            }}
                        >
                            Keep account
                        </button>
                    </div>
                </div>
            ) : (
                <button
                    type="button"
                    disabled={busy}
                    className={button}
                    onClick={() => setOpen(true)}
                >
                    <Trash2 className="size-3.5" />
                    Delete account and data
                </button>
            )}
            {error && (
                <p role="alert" className="mt-3 text-xs text-rose-700">
                    {error}
                </p>
            )}
        </div>
    );
}
