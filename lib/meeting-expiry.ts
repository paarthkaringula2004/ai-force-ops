/** Application access expires at the scheduled end; provider URLs have their own lifecycle. */
export function meetingAccess<
    T extends {
        status: string;
        end: string | Date;
        joinUrl: string | null;
        meetingId: string | null;
        passcode: string | null;
    },
>(meeting: T, now = Date.now()) {
    const ended =
        !Number.isFinite(new Date(meeting.end).getTime()) || new Date(meeting.end).getTime() <= now;
    const status =
        ended && ["ready", "creating"].includes(meeting.status) ? "expired" : meeting.status;
    const available = status === "ready" && !ended;
    return {
        ...meeting,
        status,
        joinUrl: available ? meeting.joinUrl : null,
        meetingId: available ? meeting.meetingId : null,
        passcode: available ? meeting.passcode : null,
    };
}
