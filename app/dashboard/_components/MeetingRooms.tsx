"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
    ArrowRight,
    Building2,
    CalendarDays,
    Check,
    CheckCircle2,
    ChevronDown,
    Clock3,
    DoorOpen,
    LoaderCircle,
    MapPin,
    Plus,
    RefreshCw,
    Settings2,
    ShieldCheck,
    Trash2,
    Users,
    X,
} from "lucide-react";

import VirtualMeetings from "./VirtualMeetings";
import ThemedSelect from "@/components/themed-select";
import { MeetingInbox, MeetingInvitePicker } from "./MeetingInvitations";

type Room = {
    id: string;
    name: string;
    location: string;
    capacity: number;
    amenities: string;
    active: boolean;
    locationKind: "job" | "specific";
    canManage: boolean;
    available?: boolean;
};
type Booking = {
    id: string;
    roomName: string;
    title: string;
    attendees: number;
    start: string;
    end: string;
    status: string;
};
type Data = {
    canConfigure: boolean;
    configured: boolean;
    checkedAt: string;
    rooms: Room[];
    bookings: Booking[];
};
type Preview = {
    token: string;
    room: Room;
    payload: { title: string; attendees: number; start: string; end: string };
    expiresAt: string;
};
const time = (value: string) =>
    new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const input =
    "mt-2 w-full rounded-xl border border-[#e6e4f0] bg-[#fbfaff] px-3.5 py-3 text-sm text-slate-800 outline-none transition focus:border-[#6550ed] focus:bg-white focus:ring-2 focus:ring-[#6550ed]/10 disabled:opacity-50";
const primary =
    "inline-flex items-center justify-center gap-2 rounded-xl bg-[#6550ed] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#5643d6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6550ed] disabled:cursor-not-allowed disabled:opacity-40";
const secondary =
    "inline-flex items-center justify-center gap-2 rounded-xl border border-[#e6e4f0] bg-white px-4 py-3 text-sm font-medium text-slate-600 transition hover:border-[#6550ed]/40 hover:text-[#6550ed] disabled:cursor-not-allowed disabled:opacity-40";
const panel = "rounded-2xl border border-[#e9e7f2] bg-white p-5 sm:p-6";

export default function MeetingRooms() {
    const router = useRouter(),
        queryMode = useSearchParams().get("mode");
    const [mode, setMode] = useState<"virtual" | "in_person">("in_person");
    const [locationKind, setLocationKind] = useState<"job" | "specific">("job");
    const [locationFilter, setLocationFilter] = useState("all");
    const [inviteBooking, setInviteBooking] = useState<Booking | null>(null);
    useEffect(() => {
        const timer = window.setTimeout(() => {
            if (queryMode === "virtual" || queryMode === "in_person") setMode(queryMode);
        }, 0);
        return () => window.clearTimeout(timer);
    }, [queryMode]);
    const [data, setData] = useState<Data | null>(null),
        [error, setError] = useState(""),
        [notice, setNotice] = useState(""),
        [busy, setBusy] = useState(false);
    const [loadError, setLoadError] = useState("");
    const [preview, setPreview] = useState<Preview | null>(null),
        [cancel, setCancel] = useState<Booking | null>(null);
    const [roomId, setRoomId] = useState(""),
        [title, setTitle] = useState(""),
        [start, setStart] = useState(""),
        [end, setEnd] = useState(""),
        [attendees, setAttendees] = useState(1),
        [interval, setIntervalQuery] = useState("");
    const [roomName, setRoomName] = useState(""),
        [location, setLocation] = useState(""),
        [capacity, setCapacity] = useState(6),
        [amenities, setAmenities] = useState(""),
        [manageRooms, setManageRooms] = useState(false);
    const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
    const setupRef = useRef<HTMLDivElement>(null),
        bookingRef = useRef<HTMLElement>(null);
    const timeRef = useRef<HTMLFieldSetElement>(null),
        roomRef = useRef<HTMLFieldSetElement>(null),
        reviewRef = useRef<HTMLDivElement>(null),
        reviewButtonRef = useRef<HTMLButtonElement>(null);
    const [focusedStep, setFocusedStep] = useState<number | null>(null);
    const [removal, setRemoval] = useState<{
        kind: "room" | "booking";
        id: string;
        name: string;
    } | null>(null);
    const removalDialog = useRef<HTMLDialogElement>(null);
    useEffect(() => {
        const dialog = removalDialog.current;
        if (removal && dialog && !dialog.open) dialog.showModal();
        else if (!removal && dialog?.open) dialog.close();
    }, [removal]);
    const refresh = useCallback(
        async (signal?: AbortSignal) => {
            try {
                const response = await fetch(`/api/meeting-rooms${interval}`, {
                    cache: "no-store",
                    signal,
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error);
                if (!signal?.aborted) {
                    setData(result);
                    setLoadError("");
                }
            } catch (e) {
                if (!signal?.aborted)
                    setLoadError(e instanceof Error ? e.message : "Could not load rooms.");
            }
        },
        [interval],
    );
    useEffect(() => {
        const controller = new AbortController();
        const initial = window.setTimeout(() => void refresh(controller.signal), 0);
        const timer = window.setInterval(() => {
            if (document.visibilityState === "visible") void refresh(controller.signal);
        }, 5000);
        const visible = () => {
            if (document.visibilityState === "visible") void refresh(controller.signal);
        };
        document.addEventListener("visibilitychange", visible);
        return () => {
            controller.abort();
            window.clearTimeout(initial);
            window.clearInterval(timer);
            document.removeEventListener("visibilitychange", visible);
        };
    }, [refresh]);
    async function mutate(body: Record<string, unknown>, success: string) {
        setBusy(true);
        setError("");
        setNotice("");
        try {
            const response = await fetch("/api/meeting-rooms", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error);
            setNotice(success);
            await refresh();
            return result;
        } catch (e) {
            setError(e instanceof Error ? e.message : "The request failed.");
            return null;
        } finally {
            setBusy(false);
        }
    }
    function configureRoom(room: Room) {
        setEditingRoomId(room.id);
        setRoomName(room.name);
        setLocation(room.location);
        setLocationKind(room.locationKind);
        setCapacity(room.capacity);
        setAmenities(room.amenities);
        setManageRooms(true);
        setError("");
        setNotice("");
        window.setTimeout(() => {
            setupRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            setupRef.current
                ?.querySelector<HTMLInputElement>("input")
                ?.focus({ preventScroll: true });
        }, 0);
    }
    function closeRoomSettings() {
        setEditingRoomId(null);
        setRoomName("");
        setLocation("");
        setLocationKind("job");
        setCapacity(6);
        setAmenities("");
        setManageRooms(false);
    }
    function details() {
        if (!start || !end) throw new Error("Choose your meeting's start and end time first.");
        return {
            roomId,
            title,
            attendees,
            start: new Date(start).toISOString(),
            end: new Date(end).toISOString(),
        };
    }
    async function check() {
        setError("");
        setNotice("");
        setPreview(null);
        try {
            const value = details();
            if (Date.parse(value.end) <= Date.parse(value.start))
                throw new Error("The meeting must end after it starts.");
            const query = `?${new URLSearchParams({ start: value.start, end: value.end, attendees: String(attendees) })}`;
            if (query === interval) await refresh();
            else setIntervalQuery(query);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Choose valid dates.");
        }
    }
    async function prepare(e: FormEvent) {
        e.preventDefault();
        setError("");
        setNotice("");
        if (!canReview) return;
        try {
            const result = await mutate({ action: "preview", ...details() }, "");
            if (result) {
                setPreview(result);
                setFocusedStep(2);
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : "Choose valid details.");
        }
    }
    const change = () => {
        setPreview(null);
        setNotice("");
        setError("");
        setIntervalQuery("");
        setFocusedStep(0);
    };
    const activeRooms = data?.rooms.filter((room) => room.active) || [];
    const upcoming = data?.bookings.filter((booking) => booking.status === "confirmed") || [];
    const needsSetup = !!data && !data.configured;
    const selectedRoom = data?.rooms.find((room) => room.id === roomId);
    const validAttendees = Number.isInteger(attendees) && attendees >= 1 && attendees <= 500;
    const capacityMismatch = !!selectedRoom && attendees > selectedRoom.capacity;
    const validTime =
        !!start &&
        !!end &&
        Number.isFinite(Date.parse(start)) &&
        Date.parse(end) > Date.parse(start);
    const canReview =
        validTime &&
        validAttendees &&
        !!selectedRoom?.active &&
        !capacityMismatch &&
        selectedRoom.available !== false &&
        !!title.trim();
    const capacityMessage = capacityMismatch
        ? `${selectedRoom!.name} seats ${selectedRoom!.capacity}, but you entered ${attendees} attendees. Reduce the group size or choose a larger room.`
        : !validAttendees
          ? "Enter a whole number from 1 to 500."
          : "";
    const steps =
        needsSetup && data?.canConfigure
            ? ["Add your first room", "Choose a time & room", "Review & confirm"]
            : ["Choose a time", "Select a room", "Review & confirm"];
    const currentStep = needsSetup
        ? 0
        : (focusedStep ?? (preview ? 2 : validTime && validAttendees ? 1 : 0));
    function jumpToStep(index: number) {
        setFocusedStep(index);
        if (index < 2) {
            setPreview(null);
            setError("");
        }
        const section = needsSetup
            ? setupRef.current
            : index === 0
              ? timeRef.current
              : index === 1
                ? roomRef.current
                : preview
                  ? reviewRef.current
                  : reviewButtonRef.current;
        section?.scrollIntoView({ behavior: "smooth", block: "center" });
        const control =
            index === 2
                ? preview
                    ? reviewRef.current?.querySelector<HTMLButtonElement>("button")
                    : reviewButtonRef.current
                : section?.querySelector<HTMLInputElement | HTMLSelectElement>("input, select");
        control?.focus({ preventScroll: true });
    }

    return (
        <div className="min-h-0 flex-1 overflow-y-auto bg-[#f8f7fc] p-4 sm:p-6 lg:p-8">
            <div className="mx-auto max-w-6xl space-y-5 pb-8">
                <header className="relative overflow-hidden rounded-3xl border border-[#e9e7f2] bg-white p-6 sm:p-8">
                    <div
                        aria-hidden="true"
                        className="pointer-events-none absolute -right-12 -top-24 size-80 rounded-full bg-[#eeebff] blur-3xl"
                    />
                    <div className="relative flex flex-wrap items-start justify-between gap-5">
                        <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6550ed]">
                                Your workplace, together
                            </p>
                            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                                Meeting Rooms
                            </h1>
                            <p className="mt-3 max-w-lg text-sm leading-6 text-slate-500">
                                {mode === "virtual"
                                    ? "Meet online with Google Meet or Microsoft Teams. Connect your account, create a link, and invite people from your workspace."
                                    : "Find a space for your next conversation. Choose a time, pick a room, and confirm your reservation."}
                            </p>
                        </div>
                        <div className="flex flex-wrap items-end gap-2">
                            <label className="text-xs font-semibold text-slate-500">
                                Meeting mode
                                <ThemedSelect
                                    aria-label="Meeting mode"
                                    value={mode}
                                    onChange={(e) => {
                                        const next = e.target.value as "virtual" | "in_person";
                                        setMode(next);
                                        router.replace(`/dashboard/meeting-rooms?mode=${next}`, {
                                            scroll: false,
                                        });
                                    }}
                                    className={`${input} mt-1 min-w-36 bg-white`}
                                >
                                    <option value="virtual">Virtual</option>
                                    <option value="in_person">In person</option>
                                </ThemedSelect>
                            </label>
                            {mode === "in_person" && (
                                <>
                                    <button
                                        aria-label="Refresh meeting rooms"
                                        className={secondary}
                                        onClick={() => {
                                            setError("");
                                            void refresh();
                                        }}
                                    >
                                        <RefreshCw className="size-4" />
                                        Refresh
                                    </button>
                                    {data?.canConfigure && (
                                        <button
                                            aria-expanded={manageRooms || needsSetup}
                                            className={secondary}
                                            onClick={() => {
                                                setManageRooms((value) => !value);
                                                if (needsSetup)
                                                    setupRef.current?.scrollIntoView({
                                                        behavior: "smooth",
                                                        block: "start",
                                                    });
                                            }}
                                        >
                                            <Settings2 className="size-4" />
                                            {needsSetup ? "Set up rooms" : "Manage rooms"}
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                    {mode === "in_person" && (
                        <div className="relative mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-[#efedf6] pt-5 text-xs text-slate-500">
                            <span className="flex items-center gap-2">
                                <DoorOpen className="size-4 text-[#6550ed]" />
                                <strong className="font-semibold text-slate-800">
                                    {data ? activeRooms.length : "—"}
                                </strong>{" "}
                                {activeRooms.length === 1 ? "room" : "rooms"} ready to book
                            </span>
                            <span className="flex items-center gap-2">
                                <CalendarDays className="size-4 text-[#6550ed]" />
                                <strong className="font-semibold text-slate-800">
                                    {data ? upcoming.length : "—"}
                                </strong>{" "}
                                upcoming {upcoming.length === 1 ? "reservation" : "reservations"}
                            </span>
                            <span className="flex items-center gap-2 sm:ml-auto">
                                <span
                                    className={`size-1.5 rounded-full ${data ? "bg-emerald-500" : "bg-slate-300"}`}
                                />
                                Availability refreshes every 5s
                            </span>
                        </div>
                    )}
                </header>

                {mode === "virtual" ? (
                    <VirtualMeetings />
                ) : (
                    <>
                        {(error || loadError) && (
                            <div
                                role="alert"
                                className="sticky top-0 z-10 flex items-start justify-between gap-4 rounded-xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-700"
                            >
                                <p>{error || loadError}</p>
                                <button
                                    aria-label="Dismiss error"
                                    onClick={() => {
                                        setError("");
                                        setLoadError("");
                                    }}
                                >
                                    <X className="size-4" />
                                </button>
                            </div>
                        )}
                        {notice && (
                            <div
                                role="status"
                                className="sticky top-0 z-10 flex items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-700"
                            >
                                <CheckCircle2 className="size-5 shrink-0" />
                                {notice}
                            </div>
                        )}
                        {!data ? (
                            <div
                                className={`${panel} flex items-center gap-3 text-sm text-slate-500`}
                            >
                                <LoaderCircle className="size-5 animate-spin text-[#6550ed]" />
                                Getting your meeting rooms ready…
                            </div>
                        ) : (
                            <>
                                <nav
                                    aria-label="Booking steps"
                                    className="grid gap-3 sm:grid-cols-3"
                                >
                                    {steps.map((label, index) => (
                                        <button
                                            type="button"
                                            key={label}
                                            onClick={() => jumpToStep(index)}
                                            disabled={
                                                busy ||
                                                (needsSetup
                                                    ? !data.canConfigure || index > 0
                                                    : index === 2 && !canReview && !preview)
                                            }
                                            aria-current={
                                                index === currentStep ? "step" : undefined
                                            }
                                            className={`flex items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition hover:border-[#b9aaff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6550ed] disabled:cursor-not-allowed disabled:opacity-50 ${index === currentStep ? "border-[#dcd5ff] bg-[#f0edff]" : "border-[#e9e7f2] bg-white"}`}
                                        >
                                            <span
                                                className={`flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${index === currentStep ? "bg-[#6550ed] text-white" : "bg-[#f5f4fa] text-slate-500"}`}
                                            >
                                                {!needsSetup &&
                                                (index === 0
                                                    ? validTime && validAttendees
                                                    : index === 1
                                                      ? canReview
                                                      : false) &&
                                                index !== currentStep ? (
                                                    <Check className="size-4" />
                                                ) : (
                                                    `0${index + 1}`
                                                )}
                                            </span>
                                            <span
                                                className={`text-sm font-medium ${index === currentStep ? "text-[#5140b8]" : "text-slate-600"}`}
                                            >
                                                {label}
                                            </span>
                                        </button>
                                    ))}
                                </nav>

                                {needsSetup && (
                                    <section
                                        className={`${panel} flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:p-8`}
                                    >
                                        <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-[#f0edff] text-[#6550ed]">
                                            <Building2 className="size-8" />
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-[11px] font-semibold uppercase tracking-widest text-[#6550ed]">
                                                {data.canConfigure
                                                    ? "Start here"
                                                    : "Room setup needed"}
                                            </p>
                                            <h2 className="mt-2 text-xl font-semibold text-slate-900">
                                                {data.canConfigure
                                                    ? "Let's add your first meeting room"
                                                    : "Your rooms are not ready yet"}
                                            </h2>
                                            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
                                                {data.canConfigure
                                                    ? "Add an actual room in your workplace with its location and seating capacity. Once saved, everyone in your workspace can book it here."
                                                    : "Ask your workspace Admin or Manager to add meeting rooms. Once a room is available, you can choose a time and make your own reservation here."}
                                            </p>
                                        </div>
                                        {data.canConfigure && (
                                            <button
                                                className={primary}
                                                onClick={() => {
                                                    setupRef.current?.scrollIntoView({
                                                        behavior: "smooth",
                                                        block: "start",
                                                    });
                                                    setupRef.current
                                                        ?.querySelector<HTMLInputElement>("input")
                                                        ?.focus({ preventScroll: true });
                                                }}
                                            >
                                                Add first room
                                                <ArrowRight className="size-4" />
                                            </button>
                                        )}
                                    </section>
                                )}

                                {data.canConfigure && (needsSetup || manageRooms) && (
                                    <div ref={setupRef} className={`${panel} scroll-mt-5`}>
                                        <div className="flex items-center gap-3">
                                            <span className="rounded-xl bg-[#f5f3ff] p-2 text-[#6550ed]">
                                                <Plus className="size-5" />
                                            </span>
                                            <div>
                                                <h2 className="text-lg font-semibold text-slate-900">
                                                    {editingRoomId
                                                        ? "Configure meeting room"
                                                        : needsSetup
                                                          ? "Room details"
                                                          : "Add a meeting room"}
                                                </h2>
                                                <p className="mt-1 text-xs text-slate-500">
                                                    Admin / Manager setup · Use your workplace’s
                                                    actual room information.
                                                </p>
                                            </div>
                                        </div>
                                        <form
                                            onSubmit={async (e) => {
                                                e.preventDefault();
                                                const result = await mutate(
                                                    {
                                                        action: "configure",
                                                        ...(editingRoomId
                                                            ? { roomId: editingRoomId }
                                                            : {}),
                                                        name: roomName,
                                                        location,
                                                        locationKind,
                                                        capacity,
                                                        amenities,
                                                    },
                                                    editingRoomId
                                                        ? "Room configuration saved. Existing reservations are retained."
                                                        : "Room added. You can now choose a time and make a reservation.",
                                                );
                                                if (result) closeRoomSettings();
                                            }}
                                            className="mt-6 grid gap-5 sm:grid-cols-2"
                                        >
                                            <label className="text-sm font-medium text-slate-700 sm:col-span-2">
                                                Location type
                                                <select
                                                    value={locationKind}
                                                    onChange={(e) =>
                                                        setLocationKind(
                                                            e.target.value as "job" | "specific",
                                                        )
                                                    }
                                                    className={input}
                                                >
                                                    <option value="job">Job location</option>
                                                    <option value="specific">
                                                        Specific location
                                                    </option>
                                                </select>
                                            </label>
                                            <label className="text-sm font-medium text-slate-700">
                                                Room name <span className="text-[#6550ed]">*</span>
                                                <input
                                                    required
                                                    maxLength={100}
                                                    placeholder="Enter the room's name"
                                                    value={roomName}
                                                    onChange={(e) => setRoomName(e.target.value)}
                                                    className={input}
                                                />
                                            </label>
                                            <label className="text-sm font-medium text-slate-700">
                                                Location <span className="text-[#6550ed]">*</span>
                                                <input
                                                    required
                                                    maxLength={200}
                                                    placeholder="Building, floor or office"
                                                    value={location}
                                                    onChange={(e) => setLocation(e.target.value)}
                                                    className={input}
                                                />
                                            </label>
                                            <label className="text-sm font-medium text-slate-700">
                                                Seating capacity{" "}
                                                <span className="text-[#6550ed]">*</span>
                                                <input
                                                    required
                                                    type="number"
                                                    min={1}
                                                    max={500}
                                                    value={capacity}
                                                    onChange={(e) =>
                                                        setCapacity(Number(e.target.value))
                                                    }
                                                    className={input}
                                                />
                                                <span className="mt-2 block text-xs font-normal text-slate-400">
                                                    Maximum number of people the room can seat.
                                                </span>
                                            </label>
                                            <label className="text-sm font-medium text-slate-700">
                                                Equipment{" "}
                                                <span className="font-normal text-slate-400">
                                                    (optional)
                                                </span>
                                                <input
                                                    maxLength={1000}
                                                    placeholder="Screen, whiteboard, video conferencing…"
                                                    value={amenities}
                                                    onChange={(e) => setAmenities(e.target.value)}
                                                    className={input}
                                                />
                                            </label>
                                            <div className="flex flex-wrap items-center gap-4 border-t border-[#efedf6] pt-5 sm:col-span-2">
                                                <button
                                                    type="submit"
                                                    disabled={busy}
                                                    className={primary}
                                                >
                                                    {busy ? (
                                                        <LoaderCircle className="size-4 animate-spin" />
                                                    ) : (
                                                        <Plus className="size-4" />
                                                    )}
                                                    {editingRoomId ? "Save changes" : "Save room"}
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={busy}
                                                    className={secondary}
                                                    onClick={closeRoomSettings}
                                                >
                                                    Cancel
                                                </button>
                                                <p className="text-xs text-slate-500">
                                                    This room will be available to your workspace.
                                                </p>
                                            </div>
                                        </form>
                                    </div>
                                )}

                                {data.configured && (
                                    <label className="block max-w-xs text-sm font-medium text-slate-700">
                                        Location type
                                        <select
                                            value={locationFilter}
                                            onChange={(e) => {
                                                setLocationFilter(e.target.value);
                                                setRoomId("");
                                                setPreview(null);
                                            }}
                                            className={input}
                                        >
                                            <option value="all">All locations</option>
                                            <option value="job">Job location</option>
                                            <option value="specific">Specific location</option>
                                        </select>
                                    </label>
                                )}
                                {data.configured && (
                                    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
                                        <section
                                            ref={bookingRef}
                                            className={`${panel} scroll-mt-5`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <span className="rounded-xl bg-[#f0edff] p-2 text-[#6550ed]">
                                                    <CalendarDays className="size-5" />
                                                </span>
                                                <div>
                                                    <h2 className="text-lg font-semibold text-slate-900">
                                                        Plan your meeting
                                                    </h2>
                                                    <p className="mt-1 text-xs text-slate-500">
                                                        Start with when you’re meeting and how many
                                                        people will join.
                                                    </p>
                                                </div>
                                            </div>
                                            <form onSubmit={prepare} className="mt-6 space-y-6">
                                                <fieldset
                                                    ref={timeRef}
                                                    disabled={busy}
                                                    className="grid scroll-mt-5 gap-4 sm:grid-cols-2"
                                                >
                                                    <legend className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                                                        1 · Time & people
                                                    </legend>
                                                    <label className="text-sm font-medium text-slate-700">
                                                        Starts
                                                        <input
                                                            required
                                                            type="datetime-local"
                                                            value={start}
                                                            onChange={(e) => {
                                                                setStart(e.target.value);
                                                                change();
                                                            }}
                                                            className={input}
                                                        />
                                                    </label>
                                                    <label className="text-sm font-medium text-slate-700">
                                                        Ends
                                                        <input
                                                            required
                                                            type="datetime-local"
                                                            value={end}
                                                            onChange={(e) => {
                                                                setEnd(e.target.value);
                                                                change();
                                                            }}
                                                            className={input}
                                                        />
                                                    </label>
                                                    <label className="text-sm font-medium text-slate-700">
                                                        Number of attendees
                                                        <input
                                                            required
                                                            type="number"
                                                            min={1}
                                                            max={500}
                                                            aria-invalid={!!capacityMessage}
                                                            aria-describedby="attendee-guidance"
                                                            value={attendees}
                                                            onChange={(e) => {
                                                                setAttendees(
                                                                    Number(e.target.value),
                                                                );
                                                                change();
                                                            }}
                                                            className={`${input} ${capacityMessage ? "border-rose-300 bg-rose-50/40" : ""}`}
                                                        />
                                                        <span
                                                            id="attendee-guidance"
                                                            role={
                                                                capacityMessage
                                                                    ? "status"
                                                                    : undefined
                                                            }
                                                            className={`mt-2 block text-xs font-normal leading-5 ${capacityMessage ? "text-rose-600" : "text-slate-400"}`}
                                                        >
                                                            {capacityMessage ||
                                                                (selectedRoom
                                                                    ? `Selected room seats up to ${selectedRoom.capacity} people.`
                                                                    : "Choose a room with enough seats for everyone.")}
                                                        </span>
                                                    </label>
                                                    <div className="flex items-end">
                                                        <button
                                                            type="button"
                                                            disabled={busy || !start || !end}
                                                            onClick={() => void check()}
                                                            className={`${secondary} w-full`}
                                                        >
                                                            <RefreshCw className="size-4" />
                                                            Check availability
                                                        </button>
                                                    </div>
                                                </fieldset>
                                                <p className="flex items-center gap-2 text-xs text-slate-400">
                                                    <Clock3 className="size-3.5" />
                                                    Times are in{" "}
                                                    {
                                                        Intl.DateTimeFormat().resolvedOptions()
                                                            .timeZone
                                                    }
                                                    . Meetings can last up to 24 hours.
                                                </p>
                                                <fieldset
                                                    ref={roomRef}
                                                    disabled={busy}
                                                    className="grid scroll-mt-5 gap-4 border-t border-[#efedf6] pt-5 sm:grid-cols-2"
                                                >
                                                    <legend className="pt-5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                                                        2 · Room & meeting
                                                    </legend>
                                                    <label className="text-sm font-medium text-slate-700">
                                                        Room
                                                        <select
                                                            required
                                                            value={roomId}
                                                            onChange={(e) => {
                                                                setRoomId(e.target.value);
                                                                setPreview(null);
                                                                setNotice("");
                                                                setError("");
                                                                setFocusedStep(1);
                                                            }}
                                                            className={input}
                                                        >
                                                            <option value="">
                                                                Choose a meeting room
                                                            </option>
                                                            {activeRooms
                                                                .filter(
                                                                    (room) =>
                                                                        locationFilter === "all" ||
                                                                        room.locationKind ===
                                                                            locationFilter,
                                                                )
                                                                .map((room) => (
                                                                    <option
                                                                        key={room.id}
                                                                        value={room.id}
                                                                        disabled={
                                                                            room.capacity <
                                                                                attendees ||
                                                                            room.available === false
                                                                        }
                                                                    >
                                                                        {room.name} ·{" "}
                                                                        {room.capacity} seats
                                                                        {room.capacity < attendees
                                                                            ? " — too small for your group"
                                                                            : room.available ===
                                                                                false
                                                                              ? " — unavailable"
                                                                              : ""}
                                                                    </option>
                                                                ))}
                                                        </select>
                                                    </label>
                                                    <label className="text-sm font-medium text-slate-700">
                                                        Meeting title
                                                        <input
                                                            required
                                                            maxLength={150}
                                                            placeholder="What is the meeting about?"
                                                            value={title}
                                                            onChange={(e) => {
                                                                setTitle(e.target.value);
                                                                setPreview(null);
                                                                setNotice("");
                                                                setError("");
                                                            }}
                                                            className={input}
                                                        />
                                                    </label>
                                                </fieldset>
                                                {selectedRoom && (
                                                    <p className="flex items-center gap-2 rounded-xl bg-[#f8f7fc] p-3 text-xs text-slate-500">
                                                        <MapPin className="size-4 shrink-0 text-[#6550ed]" />
                                                        {selectedRoom.location ||
                                                            "Location not specified"}{" "}
                                                        · {selectedRoom.capacity} seats
                                                    </p>
                                                )}
                                                <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[#efedf6] pt-5">
                                                    <p className="max-w-xs text-xs leading-5 text-slate-400">
                                                        Review the details next. Your room is
                                                        reserved only after you confirm.
                                                    </p>
                                                    <button
                                                        type="submit"
                                                        ref={reviewButtonRef}
                                                        disabled={busy || !canReview}
                                                        className={primary}
                                                    >
                                                        {busy ? (
                                                            <LoaderCircle className="size-4 animate-spin" />
                                                        ) : null}
                                                        Review booking
                                                        <ArrowRight className="size-4" />
                                                    </button>
                                                </div>
                                            </form>
                                            {preview && (
                                                <div
                                                    ref={reviewRef}
                                                    role="region"
                                                    aria-label="Review meeting booking"
                                                    className="mt-6 rounded-2xl border border-[#dcd5ff] bg-[#f8f6ff] p-5"
                                                >
                                                    <p className="text-[11px] font-semibold uppercase tracking-widest text-[#6550ed]">
                                                        Final step
                                                    </p>
                                                    <h3 className="mt-2 text-lg font-semibold text-slate-900">
                                                        Ready to reserve?
                                                    </h3>
                                                    <p className="mt-3 font-medium text-slate-800">
                                                        {preview.payload.title}
                                                    </p>
                                                    <p className="mt-1 text-sm text-slate-500">
                                                        {preview.room.name} ·{" "}
                                                        {preview.payload.attendees} people
                                                    </p>
                                                    <p className="mt-3 text-sm text-slate-600">
                                                        {time(preview.payload.start)} →{" "}
                                                        {time(preview.payload.end)}
                                                    </p>
                                                    <p className="mt-3 text-xs leading-5 text-slate-500">
                                                        Not reserved yet. Confirm by{" "}
                                                        {time(preview.expiresAt)}. Availability is
                                                        checked again when you confirm.
                                                    </p>
                                                    <div className="mt-5 flex flex-wrap gap-3">
                                                        <button
                                                            disabled={busy}
                                                            className={primary}
                                                            onClick={async () => {
                                                                const result = await mutate(
                                                                    {
                                                                        action: "confirm",
                                                                        token: preview.token,
                                                                    },
                                                                    "Reservation confirmed. You'll find it in My bookings below.",
                                                                );
                                                                if (result) setPreview(null);
                                                            }}
                                                        >
                                                            <Check className="size-4" />
                                                            Confirm reservation
                                                        </button>
                                                        <button
                                                            disabled={busy}
                                                            className={secondary}
                                                            onClick={() => jumpToStep(1)}
                                                        >
                                                            Change room or details
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </section>
                                        <aside className={`${panel} bg-white`}>
                                            <h2 className="text-sm font-semibold text-slate-900">
                                                A little help before you book
                                            </h2>
                                            <div className="mt-5 space-y-5">
                                                <div className="flex gap-3">
                                                    <Clock3 className="mt-0.5 size-4 shrink-0 text-[#6550ed]" />
                                                    <p className="text-xs leading-6 text-slate-500">
                                                        <strong className="block font-medium text-slate-800">
                                                            Find a time that works
                                                        </strong>
                                                        Set the start, end and number of attendees.
                                                        Check availability to see which rooms fit.
                                                    </p>
                                                </div>
                                                <div className="flex gap-3">
                                                    <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#6550ed]" />
                                                    <p className="text-xs leading-6 text-slate-500">
                                                        <strong className="block font-medium text-slate-800">
                                                            You’re in control
                                                        </strong>
                                                        Review your details, then confirm. You can
                                                        cancel your own reservation from My
                                                        bookings.
                                                    </p>
                                                </div>
                                                <div className="flex gap-3">
                                                    <CalendarDays className="mt-0.5 size-4 shrink-0 text-[#6550ed]" />
                                                    <p className="text-xs leading-6 text-slate-500">
                                                        <strong className="block font-medium text-slate-800">
                                                            Saved in AIForce.Ops
                                                        </strong>
                                                        This calendar reserves the room here. It
                                                        does not send Google or Microsoft calendar
                                                        invitations.
                                                    </p>
                                                </div>
                                            </div>
                                        </aside>
                                    </div>
                                )}

                                {data.rooms.length > 0 && (
                                    <section className={panel}>
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <div>
                                                <h2 className="text-lg font-semibold text-slate-900">
                                                    Explore rooms
                                                </h2>
                                                <p className="mt-1 text-xs text-slate-500">
                                                    {interval
                                                        ? "Availability for your selected time and group size."
                                                        : "Choose a time above to check availability."}
                                                </p>
                                            </div>
                                            <p className="text-[11px] text-slate-400">
                                                Last checked {time(data.checkedAt)}
                                            </p>
                                        </div>
                                        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                            {data.rooms
                                                .filter(
                                                    (room) =>
                                                        locationFilter === "all" ||
                                                        room.locationKind === locationFilter,
                                                )
                                                .map((room) => (
                                                    <article
                                                        key={room.id}
                                                        className={`rounded-2xl border p-5 transition ${roomId === room.id ? "border-[#b9aaff] bg-[#faf8ff]" : "border-[#e9e7f2] bg-white"}`}
                                                    >
                                                        <div className="flex items-center justify-between gap-2">
                                                            <span className="rounded-xl bg-[#f0edff] p-2.5 text-[#6550ed]">
                                                                <DoorOpen className="size-5" />
                                                            </span>
                                                            <span
                                                                className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${room.active && room.available === true ? "bg-emerald-50 text-emerald-700" : "bg-[#f5f4f9] text-slate-500"}`}
                                                            >
                                                                {!room.active
                                                                    ? "Disabled"
                                                                    : room.capacity < attendees
                                                                      ? "Too small for your group"
                                                                      : room.available === true
                                                                        ? "Available"
                                                                        : room.available === false
                                                                          ? "Unavailable"
                                                                          : "Check a time"}
                                                            </span>
                                                        </div>
                                                        <h3 className="mt-4 font-semibold text-slate-900">
                                                            {room.name}
                                                        </h3>
                                                        <p className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                                                            <MapPin className="size-3.5 shrink-0" />
                                                            {room.location ||
                                                                "Location not specified"}
                                                        </p>
                                                        <p className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                                                            <Users className="size-3.5" />
                                                            Up to {room.capacity} people
                                                        </p>
                                                        {room.amenities && (
                                                            <p className="mt-3 text-xs leading-5 text-slate-400">
                                                                {room.amenities}
                                                            </p>
                                                        )}
                                                        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#efedf6] pt-4">
                                                            {room.active && (
                                                                <button
                                                                    disabled={
                                                                        busy ||
                                                                        room.capacity < attendees ||
                                                                        room.available === false
                                                                    }
                                                                    className="inline-flex items-center gap-2 text-xs font-semibold text-[#6550ed] disabled:cursor-not-allowed disabled:opacity-40"
                                                                    onClick={() => {
                                                                        setRoomId(room.id);
                                                                        setPreview(null);
                                                                        setNotice("");
                                                                        setError("");
                                                                        setFocusedStep(1);
                                                                        bookingRef.current?.scrollIntoView(
                                                                            {
                                                                                behavior: "smooth",
                                                                                block: "start",
                                                                            },
                                                                        );
                                                                    }}
                                                                >
                                                                    {roomId === room.id ? (
                                                                        <>
                                                                            <Check className="size-3.5" />
                                                                            Selected
                                                                        </>
                                                                    ) : (
                                                                        <>
                                                                            Choose room
                                                                            <ArrowRight className="size-3.5" />
                                                                        </>
                                                                    )}
                                                                </button>
                                                            )}
                                                            {room.canManage && (
                                                                <div className="flex items-center gap-4">
                                                                    <button
                                                                        type="button"
                                                                        disabled={busy}
                                                                        aria-label={`Configure room ${room.name}`}
                                                                        title="Configure room"
                                                                        className="rounded-lg p-2 text-[#6550ed] transition hover:bg-[#f0edff] focus-visible:outline-2 focus-visible:outline-[#6550ed] disabled:opacity-40"
                                                                        onClick={() =>
                                                                            configureRoom(room)
                                                                        }
                                                                    >
                                                                        <Settings2 className="size-4" />
                                                                    </button>
                                                                    <button
                                                                        disabled={busy}
                                                                        className="text-xs text-slate-400 hover:text-slate-700 disabled:opacity-40"
                                                                        onClick={() =>
                                                                            void mutate(
                                                                                {
                                                                                    action: "room-state",
                                                                                    roomId: room.id,
                                                                                    active: !room.active,
                                                                                },
                                                                                room.active
                                                                                    ? "Room disabled for new reservations. Existing bookings are retained."
                                                                                    : "Room enabled for booking.",
                                                                            )
                                                                        }
                                                                    >
                                                                        {room.active
                                                                            ? "Disable"
                                                                            : "Enable"}
                                                                    </button>
                                                                    <button
                                                                        disabled={busy}
                                                                        aria-label={`Delete room ${room.name}`}
                                                                        className="inline-flex items-center gap-1.5 text-xs text-rose-600 hover:text-rose-800 disabled:opacity-40"
                                                                        onClick={() =>
                                                                            setRemoval({
                                                                                kind: "room",
                                                                                id: room.id,
                                                                                name: room.name,
                                                                            })
                                                                        }
                                                                    >
                                                                        <Trash2 className="size-3.5" />
                                                                        Delete
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </article>
                                                ))}
                                        </div>
                                        {!data.rooms.some(
                                            (room) =>
                                                locationFilter === "all" ||
                                                room.locationKind === locationFilter,
                                        ) && (
                                            <p className="mt-4 rounded-xl bg-[#faf9ff] p-4 text-sm text-slate-500">
                                                No rooms match this location type. Choose All
                                                locations or ask an Admin or Manager to add a room
                                                here.
                                            </p>
                                        )}
                                    </section>
                                )}

                                <section className={panel}>
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <h2 className="text-lg font-semibold text-slate-900">
                                                My bookings
                                            </h2>
                                            <p className="mt-1 text-xs text-slate-500">
                                                Your upcoming reservations and cancellations.
                                            </p>
                                        </div>
                                        <span className="rounded-full bg-[#f0edff] px-3 py-1 text-xs font-semibold text-[#6550ed]">
                                            {upcoming.length} upcoming
                                        </span>
                                    </div>
                                    {!data.bookings.length ? (
                                        <div className="mt-5 flex items-center gap-4 rounded-xl border border-dashed border-[#e6e1f5] bg-[#fcfbff] p-5">
                                            <CalendarDays className="size-6 shrink-0 text-[#aaa0d7]" />
                                            <div>
                                                <p className="text-sm font-medium text-slate-600">
                                                    Your next meeting starts here
                                                </p>
                                                <p className="mt-1 text-xs leading-5 text-slate-400">
                                                    {needsSetup
                                                        ? "Once rooms are added, your confirmed reservations will appear here."
                                                        : "No upcoming bookings yet. Choose a room above to get started."}
                                                </p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="mt-5 space-y-3">
                                            {data.bookings.map((booking) => (
                                                <article
                                                    key={booking.id}
                                                    className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#e9e7f2] p-4"
                                                >
                                                    <div>
                                                        <div className="flex flex-wrap items-center gap-3">
                                                            <h3 className="text-sm font-semibold text-slate-800">
                                                                {booking.title}
                                                            </h3>
                                                            <span
                                                                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${booking.status === "confirmed" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
                                                            >
                                                                {booking.status}
                                                            </span>
                                                        </div>
                                                        <p className="mt-2 text-xs text-slate-500">
                                                            {booking.roomName} · {booking.attendees}{" "}
                                                            {booking.attendees === 1
                                                                ? "person"
                                                                : "people"}
                                                        </p>
                                                        <p className="mt-1 text-xs text-slate-500">
                                                            {time(booking.start)} →{" "}
                                                            {time(booking.end)}
                                                        </p>
                                                        <details className="mt-2 text-[10px] text-slate-400">
                                                            <summary className="cursor-pointer">
                                                                Booking reference
                                                            </summary>
                                                            <p className="mt-1 break-all">
                                                                {booking.id}
                                                            </p>
                                                        </details>
                                                    </div>
                                                    {booking.status === "confirmed" &&
                                                        Date.parse(booking.end) >
                                                            Date.parse(data.checkedAt) && (
                                                            <button
                                                                className={secondary}
                                                                onClick={() =>
                                                                    setInviteBooking(booking)
                                                                }
                                                            >
                                                                <Users className="size-4" />
                                                                Invite
                                                            </button>
                                                        )}
                                                    {booking.status === "confirmed" && (
                                                        <button
                                                            disabled={busy}
                                                            className="rounded-lg border border-rose-100 px-3 py-2 text-xs text-rose-600 hover:bg-rose-50 disabled:opacity-40"
                                                            onClick={() => setCancel(booking)}
                                                        >
                                                            Cancel booking
                                                        </button>
                                                    )}
                                                    {booking.status === "cancelled" && (
                                                        <button
                                                            disabled={busy}
                                                            aria-label={`Delete cancelled booking ${booking.title}`}
                                                            className="inline-flex items-center gap-2 rounded-lg border border-rose-100 px-3 py-2 text-xs text-rose-600 hover:bg-rose-50 disabled:opacity-40"
                                                            onClick={() =>
                                                                setRemoval({
                                                                    kind: "booking",
                                                                    id: booking.id,
                                                                    name: booking.title,
                                                                })
                                                            }
                                                        >
                                                            <Trash2 className="size-3.5" />
                                                            Delete
                                                        </button>
                                                    )}
                                                </article>
                                            ))}
                                        </div>
                                    )}
                                    {cancel && (
                                        <div className="mt-4 rounded-xl border border-rose-100 bg-rose-50 p-4">
                                            <p className="text-sm text-slate-800">
                                                Cancel “{cancel.title}” in {cancel.roomName}?
                                            </p>
                                            <p className="mt-1 text-xs text-slate-500">
                                                This frees the room for someone else to book.
                                            </p>
                                            <div className="mt-4 flex gap-4">
                                                <button
                                                    disabled={busy}
                                                    onClick={async () => {
                                                        const result = await mutate(
                                                            {
                                                                action: "cancel",
                                                                bookingId: cancel.id,
                                                            },
                                                            "Booking cancelled. The room is available again.",
                                                        );
                                                        if (result) setCancel(null);
                                                    }}
                                                    className="text-sm font-semibold text-rose-700 disabled:opacity-40"
                                                >
                                                    Confirm cancellation
                                                </button>
                                                <button
                                                    disabled={busy}
                                                    onClick={() => setCancel(null)}
                                                    className="text-sm text-slate-500"
                                                >
                                                    Keep booking
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </section>
                                <details className="px-1 text-xs text-slate-400">
                                    <summary className="flex cursor-pointer items-center gap-2">
                                        <ChevronDown className="size-3.5" />
                                        About this calendar
                                    </summary>
                                    <p className="mt-2 max-w-2xl leading-6">
                                        Reservations are stored in AIForce.Ops. Availability
                                        refreshes every five seconds and is checked again before a
                                        booking is confirmed. Invite people using their workspace
                                        departments or names. Virtual meetings use Google Meet or
                                        Microsoft Teams through the Virtual mode above.
                                    </p>
                                </details>
                            </>
                        )}
                        {inviteBooking && (
                            <MeetingInvitePicker
                                key={inviteBooking.id}
                                id={inviteBooking.id}
                                mode="in_person"
                                title={inviteBooking.title}
                                onClose={() => setInviteBooking(null)}
                            />
                        )}
                    </>
                )}
                <MeetingInbox />
                <dialog
                    ref={removalDialog}
                    onCancel={() => setRemoval(null)}
                    aria-labelledby="remove-meeting-title"
                    className="m-auto w-[calc(100%_-_2rem)] max-w-md rounded-2xl border border-[#e9e7f2] bg-white p-6 text-slate-800 shadow-xl backdrop:bg-slate-900/35"
                >
                    {removal && (
                        <>
                            <h2 id="remove-meeting-title" className="text-lg font-semibold">
                                Delete {removal.kind === "room" ? "room" : "cancelled booking"}?
                            </h2>
                            <p className="mt-3 text-sm font-medium">{removal.name}</p>
                            <p className="mt-2 text-sm leading-6 text-slate-500">
                                {removal.kind === "room"
                                    ? "This removes the room from the calendar. Upcoming reservations must be cancelled first. Previous booking records are kept."
                                    : "This removes the cancelled booking from your list. Its reservation record is kept."}
                            </p>
                            <div className="mt-6 flex justify-end gap-3">
                                <button
                                    disabled={busy}
                                    className={secondary}
                                    onClick={() => setRemoval(null)}
                                >
                                    Keep it
                                </button>
                                <button
                                    disabled={busy}
                                    className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-3 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-40"
                                    onClick={async () => {
                                        const result = await mutate(
                                            removal.kind === "room"
                                                ? { action: "delete-room", roomId: removal.id }
                                                : {
                                                      action: "remove-booking",
                                                      bookingId: removal.id,
                                                  },
                                            removal.kind === "room"
                                                ? "Room deleted from the calendar."
                                                : "Cancelled booking deleted from your list.",
                                        );
                                        if (result) {
                                            if (removal.kind === "room" && roomId === removal.id) {
                                                setRoomId("");
                                                setPreview(null);
                                                setFocusedStep(0);
                                            }
                                            setRemoval(null);
                                        } else {
                                            setRemoval(null);
                                        }
                                    }}
                                >
                                    <Trash2 className="size-4" />
                                    {busy ? "Deleting…" : "Delete"}
                                </button>
                            </div>
                        </>
                    )}
                </dialog>
            </div>
        </div>
    );
}
