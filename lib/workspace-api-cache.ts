type CachedJson = { payload: unknown; status: number; statusText: string };

const cache = new Map<string, CachedJson>();
const inFlight = new Map<string, Promise<{ cached?: CachedJson; response?: Response }>>();
const preloadPaths = [
  "/api/agents",
  "/api/agents?view=bin",
  "/api/tools",
  "/api/playground/state",
  "/api/playground/models",
  "/api/account/profile",
  "/api/account/sessions",
  "/api/token-calculator/state",
];

let cacheUserId: string | null = null;
let fetchPatched = false;
let cacheGeneration = 0;

function cacheablePath(pathname: string) {
  return pathname === "/api/agents"
    || pathname === "/api/tools"
    || pathname === "/api/playground/state"
    || pathname === "/api/playground/models"
    || pathname === "/api/account/profile"
    || pathname === "/api/account/sessions"
    || pathname === "/api/token-calculator/state";
}

function responseFrom(cached: CachedJson) {
  return new Response(JSON.stringify(cached.payload), {
    status: cached.status,
    statusText: cached.statusText,
    headers: { "Content-Type": "application/json", "X-AIForce-Cache": "HIT" },
  });
}

export function getWorkspaceApiData<T>(path: string): T | undefined {
  if (!cacheUserId) return undefined;
  return cache.get(`${cacheUserId}:${path}`)?.payload as T | undefined;
}

function installFetchCache() {
  if (fetchPatched || typeof window === "undefined") return;
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    let url: URL;
    try {
      url = new URL(input instanceof Request ? input.url : input.toString(), window.location.origin);
    } catch {
      return originalFetch(input, init);
    }

    if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/")) return originalFetch(input, init);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (method !== "GET") {
      cacheGeneration += 1;
      cache.clear();
      const response = await originalFetch(input, init);
      if (!response.ok) return response;
      cacheGeneration += 1;
      cache.clear();
      inFlight.clear();
      return response;
    }

    if (!cacheUserId || !cacheablePath(url.pathname)) return originalFetch(input, init);
    const key = `${cacheUserId}:${url.pathname}${url.search}`;
    const saved = cache.get(key);
    if (saved) return responseFrom(saved);

    let request = inFlight.get(key);
    if (!request) {
      const generation = cacheGeneration;
      // A cached request can be shared by several pages during a route change.
      // Do not bind that shared network request to the first page's AbortSignal:
      // unmounting that page would otherwise reject every subscriber with an
      // AbortError (often shown as "signal is aborted without reason").
      const sharedInit = { ...init, signal: undefined };
      const sharedInput = input instanceof Request ? input.url : input;
      const pending = originalFetch(sharedInput, sharedInit).then(async (response) => {
        if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) return { response };
        try {
          const result: CachedJson = { payload: await response.clone().json(), status: response.status, statusText: response.statusText };
          if (generation === cacheGeneration && cacheUserId && key.startsWith(`${cacheUserId}:`)) cache.set(key, result);
          return { cached: result };
        } catch {
          return { response };
        }
      }).finally(() => { if (inFlight.get(key) === pending) inFlight.delete(key); });
      request = pending;
      inFlight.set(key, pending);
    }
    // Preserve normal per-caller cancellation while allowing the shared fetch
    // to finish and warm the cache for the destination page.
    const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    const result = await (signal ? waitForAbort(request, signal) : request);
    if (result.cached) return responseFrom(result.cached);
    return result.response?.clone() ?? originalFetch(input, init);
  };
  fetchPatched = true;
}

function waitForAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new DOMException("The operation was aborted.", "AbortError"));
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new DOMException("The operation was aborted.", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => { if (!settled) { settled = true; cleanup(); resolve(value); } },
      (error: unknown) => { if (!settled) { settled = true; cleanup(); reject(error); } },
    );
  });
}

export function activateWorkspaceApiCache(userId: string | undefined) {
  if (typeof window === "undefined") return;
  installFetchCache();
  if (cacheUserId !== userId) {
    cacheGeneration += 1;
    cache.clear();
    inFlight.clear();
    cacheUserId = userId ?? null;
  }
}

export function preloadWorkspaceApiData() {
  if (typeof window === "undefined" || !cacheUserId) return;
  for (const path of preloadPaths) void window.fetch(path).catch(() => undefined);
}

export function invalidateWorkspaceApiData(section?: string) {
  cacheGeneration += 1;
  inFlight.clear();
  if (!section || !cacheUserId) {
    cache.clear();
    return;
  }
  const pathsBySection: Record<string, string[]> = {
    Playground: ["/api/playground/state", "/api/playground/models"],
    Agents: ["/api/agents"],
    "Tool Library": ["/api/tools"],
    "Knowledge Management": ["/api/tools"],
    "General Instructions": ["/api/playground/state"],
    Models: ["/api/playground/state", "/api/playground/models"],
    Settings: ["/api/account/profile", "/api/account/sessions"],
    "Token Calculator": ["/api/token-calculator/state"],
  };
  const paths = pathsBySection[section] ?? [];
  for (const key of cache.keys()) {
    if (paths.some((path) => key.startsWith(`${cacheUserId}:${path}`))) cache.delete(key);
  }
}

export function clearWorkspaceApiData() {
  cacheGeneration += 1;
  cache.clear();
  inFlight.clear();
  cacheUserId = null;
}
