import { Client } from "pg";

// One LISTEN connection per application process, shared by all browser streams.
type Listener = () => void;
type State = {
    listeners: Set<Listener>;
    client: Client | null;
    connecting: Promise<void> | null;
    retry: ReturnType<typeof setTimeout> | null;
};
const root = globalThis as typeof globalThis & { requestNotificationEvents?: State };
const state = (root.requestNotificationEvents ??= {
    listeners: new Set(),
    client: null,
    connecting: null,
    retry: null,
});
function retry() {
    if (state.listeners.size && !state.retry)
        state.retry = setTimeout(() => {
            state.retry = null;
            void connect().catch(() => {});
        }, 3000);
}
async function connect() {
    if (state.client) return;
    if (state.connecting) return state.connecting;
    state.connecting = (async () => {
        const client = new Client({
            connectionString: process.env.DATABASE_URL,
            application_name: "aiforce-request-notifications",
            connectionTimeoutMillis: 10000,
            keepAlive: true,
        });
        const lost = () => {
            if (state.client === client) state.client = null;
            void client.end().catch(() => {});
            retry();
        };
        client.on("error", lost);
        client.on("end", () => {
            if (state.client === client) {
                state.client = null;
                retry();
            }
        });
        client.on("notification", (event) => {
            if (event.channel === "aiforce_request_updates")
                for (const callback of state.listeners) callback();
        });
        try {
            await client.connect();
            await client.query("LISTEN aiforce_request_updates");
            if (!state.listeners.size) {
                await client.end();
                return;
            }
            state.client = client;
            for (const callback of state.listeners) callback();
        } catch (error) {
            await client.end().catch(() => {});
            retry();
            throw error;
        }
    })().finally(() => {
        state.connecting = null;
    });
    return state.connecting;
}
export function subscribeRequestChanges(callback: Listener) {
    state.listeners.add(callback);
    const ready = connect();
    return {
        ready,
        unsubscribe() {
            state.listeners.delete(callback);
            if (!state.listeners.size) {
                if (state.retry) {
                    clearTimeout(state.retry);
                    state.retry = null;
                }
                const client = state.client;
                state.client = null;
                if (client) void client.end().catch(() => {});
            }
        },
    };
}
