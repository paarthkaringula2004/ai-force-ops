import type { RecordItem } from "./eassist/types";

export type AlertDescription = {
    key: string;
    time: string;
    state: string;
    history?: string[];
    severity?: string;
};

export type AlertGroup<T> = {
    item: T;
    members: T[];
    times: string[];
};

// Group display rows without merging identities used by scanner reconciliation,
// ownership checks, acknowledgement, or resolution.
export function groupRepeatedAlerts<T extends { id: string }>(
    items: T[],
    describe: (item: T) => AlertDescription,
): AlertGroup<T>[] {
    const groups = new Map<string, AlertGroup<T>>();
    const seen = new Set<string>();
    const rank = (info: AlertDescription) => {
        const state = info.state === "active" ? 2 : info.state === "acknowledged" ? 1 : 0;
        const severity = ({ critical: 4, high: 3, warning: 2, medium: 2, low: 1 } as Record<string, number>)[info.severity || ""] || 0;
        return state * 10 + severity;
    };
    for (const item of items) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        const info = describe(item);
        const times = (info.history?.length ? info.history : [info.time])
            .filter(time => Number.isFinite(Date.parse(time)));
        const group = groups.get(info.key);
        if (!group) {
            groups.set(info.key, { item, members: [item], times: [...times] });
            continue;
        }
        group.members.push(item);
        group.times.push(...times);
        const current = describe(group.item);
        if (rank(info) > rank(current) ||
            (rank(info) === rank(current) && Date.parse(info.time) > Date.parse(current.time)))
            group.item = item;
    }
    // Equal timestamps from different issues are retained as separate occurrences.
    return [...groups.values()].map(group => ({
        ...group,
        times: group.times.sort((a, b) => Date.parse(b) - Date.parse(a)),
    })).sort((a, b) => Date.parse(b.times[0] || "1970-01-01") - Date.parse(a.times[0] || "1970-01-01"));
}

export function alertGroupKey(account: string, source: string, title: string) {
    return JSON.stringify([account, source, title.trim().replace(/\s+/g, " ").toLowerCase()]);
}

export function recordAlertDescription(item: RecordItem): AlertDescription {
    const labels = (item.data.labels || {}) as Record<string, unknown>;
    const history = Array.isArray(item.data.occurrenceTimes)
        ? item.data.occurrenceTimes.filter((time): time is string => typeof time === "string")
        : undefined;
    return {
        key: alertGroupKey(
            String(labels.account_user_id || item.connection_id),
            item.data.platform ? `platform:${String(labels.component)}` : `external:${item.connection_id}`,
            String(labels.alertname || "Unnamed alert"),
        ),
        time: history?.[0] || String(item.data.startsAt || item.observed_at),
        state: String(item.data.state || "active"),
        severity: String(labels.severity || ""),
        history,
    };
}
