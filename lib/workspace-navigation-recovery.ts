type RetryStorage = Pick<Storage, "getItem" | "setItem">;

// A full reload can recover an interrupted route stream after a deployment.
// Persist the attempt before navigating so a server outage cannot cause a loop.
export function claimNavigationRecovery(storage: RetryStorage, target: string, now = Date.now()) {
    const key = `aiforce-navigation-recovery:${target}`;
    try {
        const previous = Number(storage.getItem(key));
        if (previous > 0 && now - previous < 300_000) return false;
        storage.setItem(key, String(now));
        return true;
    } catch {
        return false;
    }
}
