"use client";
import type { StaffCatalog } from "@/lib/staff-catalog";
import MemberPassword from "./MemberPassword";
import StaffCatalogEditor from "./StaffCatalogEditor";
import { employeeServiceLabels } from "@/lib/employee-services";
import OrganizationSettings from "./OrganizationSettings";
import MailCenter from "./MailCenter";
import { readableRequestDetails, leaveDeductionSummary } from "@/lib/leave-display";
import SalarySettings from "./SalarySettings";
import LeavePayReview from "./LeavePayReview";
import AuditActivity from "./AuditActivity";
import DeleteMember, { type DeletionFeedback } from "./DeleteMember";
import { CheckCircle2, XCircle, X } from "lucide-react";
import ThemedSelect from "@/components/themed-select";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { type WorkspaceAccess } from "@/lib/workspace-permissions";
type Member = WorkspaceAccess & {
    email_verified?: boolean;
    has_password?: boolean;
    name: string;
    email: string;
    updated_at: string;
    ticket_balance?: string | number;
};
type Audit = {
    id: string;
    action: string;
    actor_name: string | null;
    target_name: string | null;
    created_at: string;
};
type ServiceRequest = {
    id: string;
    request_number: string;
    kind: string;
    status: string;
    details: Record<string, string>;
    employee_name: string;
    employee_email: string;
    manager_name: string | null;
    decision_note: string;
    decided_by_name: string | null;
    created_at: string;
    updated_at: string;
    user_id: string;
    employee_role?: string;
};
const statusLabel = (value: string) =>
    ({
        all: "All statuses",
        pending_approval: "Pending approval",
        approved: "Approved",
        rejected: "Rejected",
        cancelled: "Cancelled",
        fulfilled: "Fulfilled",
    })[value] || value;
const statusColor = (value: string) =>
    value === "pending_approval"
        ? "bg-amber-50 text-amber-700 ring-amber-200"
        : value === "approved" || value === "fulfilled"
          ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
          : value === "rejected"
            ? "bg-rose-50 text-rose-700 ring-rose-200"
            : "bg-slate-100 text-slate-600 ring-slate-200";
const field = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700";
const button =
    "inline-flex h-9 items-center justify-center self-start whitespace-nowrap rounded-lg border border-indigo-200 px-3 py-2 text-xs font-medium text-indigo-700 transition hover:bg-indigo-50 disabled:opacity-40";
async function json(path: string, init?: RequestInit) {
    const r = await fetch(path, { cache: "no-store", ...init });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "Request failed.");
    return d;
}
function StaffTickets({ person, onSaved }: { person: Member; onSaved: () => void }) {
    const [open, setOpen] = useState(false),
        [amount, setAmount] = useState("100"),
        [busy, setBusy] = useState(false),
        [error, setError] = useState("");
    const [requestId, setRequestId] = useState("");
    if (person.role === "admin")
        return <p className="mt-4 text-xs font-medium text-indigo-700">Tickets: Unlimited</p>;
    if (!["employee", "manager"].includes(person.role)) return null;
    async function topup() {
        setBusy(true);
        setError("");
        try {
            await json("/api/workspace/tickets", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: person.user_id, amount: Number(amount), requestId }),
            });
            setOpen(false);
            onSaved();
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(false);
        }
    }
    return (
        <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
            <p className="text-xs font-medium">
                Tickets: {Number(person.ticket_balance || 0).toLocaleString()}
            </p>
            <p className="mt-1 text-xs text-slate-500">
                Daily reset: {person.role === "manager" ? 100 : 50} tickets · IST · Unused tickets
                do not accumulate
            </p>
            {open ? (
                <div className="mt-3">
                    <label className="text-xs">
                        Tickets to allocate
                        <input
                            type="number"
                            min={1}
                            max={1000000}
                            step={1}
                            className={`${field} mt-1 max-w-44`}
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                        />
                    </label>
                    <p className="my-2 text-xs text-slate-500">
                        Company allocation. No checkout or payment. The next daily reset restores
                        the role allowance.
                    </p>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            className={button}
                            disabled={
                                busy ||
                                !Number.isInteger(Number(amount)) ||
                                Number(amount) < 1 ||
                                Number(amount) > 1000000
                            }
                            onClick={() => void topup()}
                        >
                            {busy ? "Allocating…" : "Allocate tickets"}
                        </button>
                        <button
                            type="button"
                            className={button}
                            disabled={busy}
                            onClick={() => setOpen(false)}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            ) : (
                <button
                    type="button"
                    disabled={!person.active}
                    className={`${button} mt-2`}
                    onClick={() => {
                        setRequestId(crypto.randomUUID());
                        setOpen(true);
                    }}
                >
                    Top up tickets
                </button>
            )}
            {error && (
                <p role="alert" className="mt-2 text-xs text-rose-700">
                    {error}
                </p>
            )}
        </div>
    );
}
function EmploymentConfirmation({
    person,
    canConfirm,
    onSaved,
}: {
    person: Member;
    canConfirm: boolean;
    onSaved: () => void;
}) {
    const [confirming, setConfirming] = useState(false),
        [busy, setBusy] = useState(false),
        [error, setError] = useState("");
    async function confirm() {
        setBusy(true);
        setError("");
        try {
            await json("/api/workspace/employment", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: person.user_id, confirm: true }),
            });
            setConfirming(false);
            onSaved();
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(false);
        }
    }
    if (person.role !== "employee") return null;
    return (
        <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs">
            <p>
                {person.employment_verified_at
                    ? "Employment confirmed"
                    : "Employment not yet confirmed"}{" "}
                · Employee ID: {person.employee_id || "Generated after confirmation"}
            </p>
            {!person.employment_verified_at &&
                canConfirm &&
                (confirming ? (
                    <div className="mt-2">
                        <p>
                            Confirm that {person.name} is an employee of your organization. An ID
                            using the saved department and highest completed qualification will be
                            generated automatically.
                        </p>
                        <div className="mt-2 flex gap-2">
                            <button
                                type="button"
                                disabled={busy}
                                className={button}
                                onClick={() => void confirm()}
                            >
                                {busy ? "Confirming…" : "Confirm employee"}
                            </button>
                            <button
                                type="button"
                                disabled={busy}
                                className={button}
                                onClick={() => setConfirming(false)}
                            >
                                Back
                            </button>
                        </div>
                    </div>
                ) : (
                    <button
                        type="button"
                        className={`${button} mt-2`}
                        onClick={() => setConfirming(true)}
                    >
                        Confirm employment
                    </button>
                ))}
            {error && (
                <p role="alert" className="mt-2 text-red-700">
                    {error}
                </p>
            )}
        </div>
    );
}
function MemberEditor({
    person,
    people,
    onSaved,
    viewerId,
    onDeleted,
    onFeedback,
    catalog,
}: {
    person: Member;
    people: Member[];
    onSaved: () => void;
    viewerId: string;
    onDeleted: () => void;
    onFeedback: (feedback: DeletionFeedback) => void;
    catalog: StaffCatalog;
}) {
    const [departmentCode, setDepartmentCode] = useState(String(person.department_code || ""));
    const [role, setRole] = useState(person.role),
        [manager, setManager] = useState(person.manager_id || ""),
        [active, setActive] = useState(person.active),
        [busy, setBusy] = useState(false),
        [error, setError] = useState("");
    return (
        <form
            className="rounded-2xl border border-slate-200 bg-white p-5"
            onSubmit={async (e) => {
                e.preventDefault();
                const values = new FormData(e.currentTarget);
                setBusy(true);
                setError("");
                try {
                    await json("/api/workspace/admin", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            userId: person.user_id,
                            role,
                            managerId:
                                role === "admin" || role === "manager" ? null : manager || null,
                            active,
                            permissions: [],
                            department: role === "admin" ? "" : values.get("department"),
                            employeeId: person.employee_id,
                            departmentCode:
                                role === "admin"
                                    ? person.department_code
                                    : Number(values.get("departmentCode")) || null,
                            qualificationCode:
                                role === "admin"
                                    ? person.qualification_code
                                    : values.get("qualificationCode"),
                            jobTitleId:
                                role === "admin"
                                    ? person.job_title_id
                                    : Number(values.get("jobTitleId")) || null,
                        }),
                    });
                    onSaved();
                } catch (e) {
                    setError((e as Error).message);
                } finally {
                    setBusy(false);
                }
            }}
        >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="flex items-center gap-2 font-semibold">
                        {person.name}
                        {person.email_verified && (
                            <span title="Email verified">
                                <CheckCircle2
                                    aria-label="Email verified"
                                    className="size-4 text-emerald-600"
                                />
                            </span>
                        )}
                    </h2>
                    <p className="text-xs text-slate-500">{person.email}</p>
                </div>
                <label className="flex items-center gap-2 text-xs">
                    <input
                        type="checkbox"
                        checked={active}
                        onChange={(e) => setActive(e.target.checked)}
                    />
                    Active account
                </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <label className="text-xs">
                    Role
                    {person.role === "admin" && person.admin_id ? (
                        <>
                            <input
                                aria-label={`Role for ${person.email}`}
                                className={`${field} bg-slate-50`}
                                readOnly
                                value="Admin"
                            />
                            <span className="mt-1 block text-xs text-slate-500">
                                Role locked: Admin ID has been assigned.
                            </span>
                        </>
                    ) : (
                        <ThemedSelect
                            aria-label={`Role for ${person.email}`}
                            className={field}
                            value={role}
                            onChange={(e) => setRole(e.target.value as Member["role"])}
                        >
                            <option value="user">User</option>
                            <option value="employee">Employee</option>
                            <option value="manager">Manager</option>
                            <option value="admin">Admin</option>
                        </ThemedSelect>
                    )}
                </label>
                {role !== "admin" && (
                    <>
                        {role !== "manager" && (
                            <label className="text-xs">
                                Reporting manager
                                <ThemedSelect
                                    className={field}
                                    value={manager}
                                    onChange={(e) => setManager(e.target.value)}
                                >
                                    <option value="">Not assigned — Admin reviews requests</option>
                                    {people
                                        .filter(
                                            (p) =>
                                                p.active &&
                                                p.role === "manager" &&
                                                p.user_id !== person.user_id,
                                        )
                                        .map((p) => (
                                            <option key={p.user_id} value={p.user_id}>
                                                {p.name} · {p.email}
                                            </option>
                                        ))}
                                </ThemedSelect>
                            </label>
                        )}
                        <label className="text-xs">
                            Department
                            <ThemedSelect
                                className={field}
                                name="departmentCode"
                                value={departmentCode}
                                onChange={(e) => setDepartmentCode(e.target.value)}
                            >
                                <option value="">Select department</option>
                                {catalog.departments.map((d) => (
                                    <option key={d.code} value={d.code}>
                                        {String(d.code).padStart(2, "0")} · {d.name}
                                    </option>
                                ))}
                            </ThemedSelect>
                            <input type="hidden" name="department" value={person.department} />
                        </label>
                        <label className="text-xs">
                            Highest completed qualification
                            <ThemedSelect
                                className={field}
                                name="qualificationCode"
                                defaultValue={person.qualification_code || ""}
                            >
                                <option value="">Select qualification</option>
                                {catalog.qualifications.map((q) => (
                                    <option key={q.code} value={q.code}>
                                        {q.name} ({q.code})
                                    </option>
                                ))}
                            </ThemedSelect>
                        </label>
                        <label className="text-xs">
                            Company job title
                            <ThemedSelect
                                key={departmentCode}
                                className={field}
                                name="jobTitleId"
                                defaultValue={
                                    person.department_code === Number(departmentCode)
                                        ? person.job_title_id || ""
                                        : ""
                                }
                            >
                                <option value="">Not assigned</option>
                                {catalog.jobTitles
                                    .filter((j) => j.department_code === Number(departmentCode))
                                    .map((j) => (
                                        <option key={j.id} value={j.id}>
                                            {j.name}
                                        </option>
                                    ))}
                            </ThemedSelect>
                        </label>
                        <label className="text-xs">
                            Employee ID
                            <input
                                className={field}
                                name="employeeId"
                                maxLength={80}
                                readOnly
                                placeholder={
                                    role === "employee"
                                        ? "Generated after confirmation"
                                        : "Not assigned"
                                }
                                defaultValue={person.employee_id}
                            />
                        </label>
                    </>
                )}
                {role === "admin" && (
                    <label className="text-xs sm:col-span-2 lg:col-span-3">
                        Admin ID
                        <input
                            className={field}
                            readOnly
                            value={person.admin_id || "Generated when Admin role is saved"}
                        />
                    </label>
                )}
                <MemberPassword
                    userId={person.user_id}
                    email={person.email}
                    hasPassword={Boolean(person.has_password)}
                    self={person.user_id === viewerId}
                />
            </div>
            {role === "employee" && (
                <EmploymentConfirmation
                    person={person}
                    canConfirm={person.active && person.user_id !== viewerId}
                    onSaved={onSaved}
                />
            )}
            <StaffTickets person={person} onSaved={onSaved} />
            {error && (
                <p role="alert" className="mt-3 text-sm text-red-700">
                    {error}
                </p>
            )}
            <button disabled={busy} className={`${button} mt-4`} type="submit">
                {busy ? "Saving…" : "Save member"}
            </button>
            <DeleteMember
                userId={person.user_id}
                email={person.email}
                updatedAt={person.updated_at}
                viewerId={viewerId}
                onDeleted={onDeleted}
                onFeedback={onFeedback}
            />
        </form>
    );
}
export function Administration() {
    const [feedback, setFeedback] = useState<DeletionFeedback | null>(null);
    const [data, setData] = useState<{
            users: Member[];
            audit: Audit[];
            viewerId: string;
            catalog: StaffCatalog;
        } | null>(null),
        [error, setError] = useState(""),
        [revision, setRevision] = useState(0),
        [search, setSearch] = useState("");
    useEffect(() => {
        let cancelled = false;
        json("/api/workspace/admin")
            .then((d) => {
                if (!cancelled) {
                    setData(d);
                    setError("");
                }
            })
            .catch((e) => {
                if (!cancelled) setError(e.message);
            });
        return () => {
            cancelled = true;
        };
    }, [revision]);
    return (
        <section className="w-full overflow-y-auto bg-slate-50 p-5 sm:p-8">
            <div className="mx-auto max-w-6xl space-y-5">
                {feedback && (
                    <div
                        role={feedback.success ? "status" : "alert"}
                        className={`fixed bottom-6 right-6 z-50 flex max-w-md items-start gap-3 rounded-2xl border p-4 shadow-lg ${feedback.success ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"}`}
                    >
                        {feedback.success ? (
                            <CheckCircle2
                                aria-hidden="true"
                                className="mt-0.5 size-5 shrink-0 text-emerald-600"
                            />
                        ) : (
                            <XCircle
                                aria-hidden="true"
                                className="mt-0.5 size-5 shrink-0 text-rose-600"
                            />
                        )}
                        <div>
                            <p className="text-sm font-semibold">
                                {feedback.success ? "Account deleted" : "Deletion failed"}
                            </p>
                            <p className="mt-1 break-all text-xs leading-5">{feedback.message}</p>
                        </div>
                        <button
                            type="button"
                            aria-label="Dismiss deletion notification"
                            onClick={() => setFeedback(null)}
                            className="rounded-md p-1 hover:bg-white/60"
                        >
                            <X className="size-4" />
                        </button>
                    </div>
                )}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-semibold">Administration</h1>
                        <p className="mt-2 text-sm text-slate-500">
                            Assign roles, reporting managers and access. Changes are audited and
                            enforced on the server.
                        </p>
                    </div>
                    <button className={button} onClick={() => setRevision((v) => v + 1)}>
                        Refresh
                    </button>
                </div>
                <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4 text-sm">
                    New signups are Users. Assign Employee after hiring; confirm employment to
                    enable ePACE. Managers receive team approvals, Agent Studio, Review Center and
                    ePACE automatically. Admins have full access. At least one active Admin must
                    remain.
                </div>
                {error && (
                    <p role="alert" className="text-red-700">
                        {error}
                    </p>
                )}
                <input
                    className={field}
                    aria-label="Find member"
                    placeholder="Find a member by name or email"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                {!data && !error && <p>Loading members…</p>}
                {data?.users
                    .filter((p) =>
                        `${p.name} ${p.email}`.toLowerCase().includes(search.toLowerCase()),
                    )
                    .map((person) => (
                        <MemberEditor
                            key={`${person.user_id}:${person.updated_at}`}
                            person={person}
                            people={data.users}
                            catalog={data.catalog}
                            viewerId={data.viewerId}
                            onSaved={() => setRevision((v) => v + 1)}
                            onFeedback={setFeedback}
                            onDeleted={() => {
                                setData((current) =>
                                    current
                                        ? {
                                              ...current,
                                              users: current.users.filter(
                                                  (member) => member.user_id !== person.user_id,
                                              ),
                                          }
                                        : current,
                                );
                                setRevision((v) => v + 1);
                            }}
                        />
                    ))}
                {data && (
                    <StaffCatalogEditor
                        catalog={data.catalog}
                        onSaved={() => setRevision((v) => v + 1)}
                    />
                )}
                <OrganizationSettings admins={data?.users || []} />
                <MailCenter />
                <AuditActivity entries={data?.audit || []} loading={!data && !error} />
            </div>
        </section>
    );
}
function RequestCard({
    item,
    member,
    onSaved,
    deleteEnabled,
}: {
    item: ServiceRequest;
    member: WorkspaceAccess;
    onSaved: (notice: string) => void;
    deleteEnabled: boolean;
}) {
    const [note, setNote] = useState(""),
        [busy, setBusy] = useState(false),
        [error, setError] = useState(""),
        [confirmDelete, setConfirmDelete] = useState(false);
    const [payTreatment, setPayTreatment] = useState("policy"),
        [deductionOverrides, setDeductionOverrides] = useState<Record<string, number>>({});
    const own = item.user_id === member.user_id,
        canDecide =
            !own &&
            (member.role === "admin" ||
                (member.role === "manager" &&
                    !(item.kind === "leave" && item.employee_role === "manager")));
    async function decide(action: string) {
        setBusy(true);
        setError("");
        try {
            const d = await json("/api/workspace/requests", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    id: item.id,
                    action,
                    note,
                    version: item.updated_at,
                    ...(item.kind === "leave" ? { payTreatment, deductionOverrides } : {}),
                }),
            });
            onSaved(d.notice);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(false);
        }
    }
    async function remove() {
        setBusy(true);
        setError("");
        try {
            const d = await json("/api/workspace/requests", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: item.id, confirmation: item.request_number }),
            });
            onSaved(d.notice);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(false);
        }
    }
    return (
        <article className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap justify-between gap-2">
                <div>
                    <h2 className="font-semibold">
                        {employeeServiceLabels[item.kind] || item.kind} request ·{" "}
                        {item.request_number}
                    </h2>
                    <p className="mt-1 text-xs text-slate-500">
                        {item.employee_name} · {item.employee_email} ·{" "}
                        {new Date(item.created_at).toLocaleString()}
                    </p>
                </div>
                <span
                    className={`inline-flex h-7 shrink-0 items-center gap-1.5 self-start rounded-full px-2.5 text-[11px] font-medium ring-1 ring-inset ${statusColor(item.status)}`}
                >
                    <span className="size-1.5 rounded-full bg-current" />
                    {statusLabel(item.status)}
                </span>
            </div>
            <p className="mt-3 text-xs text-slate-500">
                Reviewer:{" "}
                {item.kind === "leave" && item.employee_role === "manager"
                    ? "Admin"
                    : item.manager_name || "Admin — reporting manager not assigned"}
            </p>
            <dl className="my-4 grid gap-3 sm:grid-cols-2">
                {readableRequestDetails(item.details).map(([key, value]) => (
                    <div key={key}>
                        <dt className="text-xs font-medium capitalize text-slate-500">
                            {key.replace(/([A-Z])/g, " $1")}
                        </dt>
                        <dd className="mt-1 whitespace-pre-wrap break-words text-sm">
                            {String(value)}
                        </dd>
                    </div>
                ))}
            </dl>
            {item.kind === "leave" && leaveDeductionSummary(item.details) && (
                <p className="mb-3 text-sm text-slate-700">
                    Salary deduction: {leaveDeductionSummary(item.details)}
                </p>
            )}
            {item.decided_by_name && (
                <p className="text-xs text-slate-500">
                    Last decision by {item.decided_by_name} ·{" "}
                    {new Date(item.updated_at).toLocaleString()}
                </p>
            )}
            {item.decision_note && (
                <p className="mt-2 whitespace-pre-wrap text-sm">
                    Decision note: {item.decision_note}
                </p>
            )}
            {((item.status === "pending_approval" && (own || canDecide)) ||
                (item.status === "approved" &&
                    ((member.role === "admin" && !own) ||
                        (item.kind === "leave" && (own || canDecide))))) && (
                <div className="mt-4 border-t pt-4">
                    {item.kind === "leave" && canDecide && (
                        <LeavePayReview
                            userId={item.user_id}
                            name={item.employee_name}
                            details={item.details}
                            onTreatment={(value) => {
                                setPayTreatment(value);
                                setDeductionOverrides({});
                            }}
                            onDeduction={(month, value) =>
                                setDeductionOverrides((current) => {
                                    const next = { ...current };
                                    if (value.trim()) next[month] = Number(value);
                                    else delete next[month];
                                    return next;
                                })
                            }
                        />
                    )}
                    {!own && (
                        <label className="block text-xs">
                            Decision / verification note
                            <textarea
                                className={`${field} mt-2`}
                                maxLength={2000}
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                placeholder="Add a decision note or fulfilment evidence"
                            />
                        </label>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                        {item.status === "pending_approval" && canDecide && (
                            <>
                                <button
                                    disabled={busy}
                                    className={button}
                                    onClick={() => void decide("approve")}
                                >
                                    Approve
                                </button>
                                <button
                                    disabled={busy || !note.trim()}
                                    className={button}
                                    onClick={() => void decide("reject")}
                                >
                                    Reject
                                </button>
                            </>
                        )}
                        {(item.status === "pending_approval" ||
                            (item.kind === "leave" && item.status === "approved")) &&
                            (own || member.role === "admin") && (
                                <button
                                    disabled={busy}
                                    className={button}
                                    onClick={() => void decide("cancel")}
                                >
                                    Cancel request
                                </button>
                            )}
                        {item.kind === "leave" && item.status === "approved" && canDecide && (
                            <button
                                disabled={busy || !note.trim()}
                                className={button}
                                onClick={() => void decide("amend_leave")}
                            >
                                Save leave pay adjustment
                            </button>
                        )}
                        {item.status === "approved" && member.role === "admin" && !own && (
                            <button
                                disabled={busy || !note.trim()}
                                className={button}
                                onClick={() => void decide("fulfil")}
                            >
                                Record manual fulfilment
                            </button>
                        )}
                    </div>
                </div>
            )}
            {deleteEnabled && (
                <div className="mt-4 border-t border-slate-100 pt-4">
                    {confirmDelete ? (
                        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                            <p className="text-sm text-rose-800">
                                Permanently delete {item.request_number}? This removes the request
                                from My Requests, Team Requests and chatbot lookups. The audit
                                record is retained.
                            </p>
                            <div className="mt-3 flex gap-2">
                                <button
                                    type="button"
                                    disabled={busy}
                                    className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-40"
                                    onClick={() => void remove()}
                                >
                                    {busy ? "Deleting…" : "Confirm delete"}
                                </button>
                                <button
                                    type="button"
                                    disabled={busy}
                                    className={button}
                                    onClick={() => setConfirmDelete(false)}
                                >
                                    Keep request
                                </button>
                            </div>
                        </div>
                    ) : (
                        <button
                            type="button"
                            disabled={busy}
                            className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-40"
                            onClick={() => setConfirmDelete(true)}
                        >
                            Delete request
                        </button>
                    )}
                </div>
            )}
            {error && (
                <p role="alert" className="mt-3 text-sm text-red-700">
                    {error}
                </p>
            )}
        </article>
    );
}
export function WorkspaceRequests({
    member,
    personal = false,
}: {
    member: WorkspaceAccess;
    personal?: boolean;
}) {
    const requestedId = useSearchParams().get("request");
    const scope = personal ? "own" : member.role === "admin" ? "all" : "team";
    const [data, setData] = useState<{
            requests: ServiceRequest[];
            team: Member[];
            deleteEnabled: boolean;
        } | null>(null),
        [revision, setRevision] = useState(0),
        [filter, setFilter] = useState("all"),
        [error, setError] = useState(""),
        [notice, setNotice] = useState("");
    useEffect(() => {
        const changed = () => setRevision((value) => value + 1);
        const refresh = setInterval(changed, 15000);
        window.addEventListener("workspace-requests-updated", changed);
        return () => {
            clearInterval(refresh);
            window.removeEventListener("workspace-requests-updated", changed);
        };
    }, []);
    const requestedLoaded = Boolean(data?.requests.some((item) => item.id === requestedId));
    useEffect(() => {
        if (requestedId && requestedLoaded)
            document
                .getElementById("request-" + requestedId)
                ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, [requestedId, requestedLoaded]);
    useEffect(() => {
        let cancelled = false;
        json(
            `/api/workspace/requests?scope=${scope}${requestedId ? `&request=${encodeURIComponent(requestedId)}` : ""}`,
        )
            .then((d) => {
                if (!cancelled) {
                    setData(d);
                    setError("");
                }
            })
            .catch((e) => {
                if (!cancelled) setError(e.message);
            });
        return () => {
            cancelled = true;
        };
    }, [revision, scope, requestedId]);
    return (
        <section className="w-full overflow-y-auto bg-slate-50 p-5 sm:p-8">
            <div className="mx-auto max-w-5xl space-y-5">
                <div className="flex flex-wrap justify-between gap-3">
                    <div>
                        <h1 className="text-2xl font-semibold">
                            {personal
                                ? "My Requests"
                                : member.role === "admin"
                                  ? "Workspace Requests"
                                  : "Team Requests"}
                        </h1>
                        <p className="mt-2 text-sm text-slate-500">
                            {personal
                                ? "Track your requests and approval decisions."
                                : "Review employee requests. You cannot approve your own requests."}
                        </p>
                    </div>
                    <button className={button} onClick={() => setRevision((v) => v + 1)}>
                        Refresh
                    </button>
                </div>
                <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4 text-sm">
                    Approvals are recorded in AIForce.Ops. Configured leave notifications are queued
                    for email delivery. Booking and provisioning require connected company systems.
                    Manual fulfilment requires an Admin verification note.
                </div>
                {notice && (
                    <p role="status" className="text-sm text-indigo-700">
                        {notice}
                    </p>
                )}
                {error && (
                    <p role="alert" className="text-red-700">
                        {error}
                    </p>
                )}
                {!personal && (
                    <details className="rounded-xl border border-slate-200 bg-white p-4">
                        <summary className="cursor-pointer text-sm font-medium">
                            {scope === "all" ? "Workspace members" : "Assigned team"} (
                            {data?.team.length || 0})
                        </summary>
                        <ul className="mt-3 space-y-2 text-xs">
                            {data?.team.map((p) => (
                                <li key={p.user_id}>
                                    {p.name} · {p.email} ·{" "}
                                    {p.department || "Department not assigned"}
                                    {!p.active ? " · Disabled" : ""}
                                    {p.user_id !== member.user_id &&
                                        (member.role === "admin" || p.role === "employee") && (
                                            <SalarySettings userId={p.user_id} name={p.name} />
                                        )}
                                    <EmploymentConfirmation
                                        person={p}
                                        canConfirm={p.active && p.user_id !== member.user_id}
                                        onSaved={() => setRevision((v) => v + 1)}
                                    />
                                </li>
                            ))}
                        </ul>
                    </details>
                )}
                <label className="flex items-center gap-3 text-sm">
                    Status
                    <ThemedSelect
                        className={`${field} max-w-56 bg-white`}
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                    >
                        {[
                            "all",
                            "pending_approval",
                            "approved",
                            "rejected",
                            "cancelled",
                            "fulfilled",
                        ].map((s) => (
                            <option key={s} value={s}>
                                {statusLabel(s)}
                            </option>
                        ))}
                    </ThemedSelect>
                </label>
                {!data && !error && <p>Loading requests…</p>}
                {data?.requests
                    .filter((r) => filter === "all" || r.status === filter)
                    .map((item) => (
                        <div
                            key={item.id}
                            id={`request-${item.id}`}
                            className={
                                requestedId === item.id
                                    ? "rounded-2xl ring-2 ring-[#6550ed] ring-offset-4"
                                    : ""
                            }
                        >
                            <RequestCard
                                key={`${item.id}:${item.updated_at}`}
                                item={item}
                                member={member}
                                deleteEnabled={Boolean(data.deleteEnabled)}
                                onSaved={(n) => {
                                    setNotice(n);
                                    setRevision((v) => v + 1);
                                }}
                            />
                        </div>
                    ))}
                {data && !data.requests.some((r) => filter === "all" || r.status === filter) && (
                    <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
                        No requests in this view.
                    </p>
                )}
                <p className="text-xs text-slate-500">Showing up to 200 recent requests.</p>
            </div>
        </section>
    );
}
