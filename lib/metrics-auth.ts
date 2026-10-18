import { timingSafeEqual } from "node:crypto";

// This credential grants read-only access to aggregate metrics, never user APIs.
export function validMetricsToken(request: Request) {
    const expected = process.env.PROMETHEUS_METRICS_TOKEN || "";
    const match = /^Bearer ([^\s]+)$/i.exec(request.headers.get("authorization") || "");
    if (expected.length < 32 || !match) return false;
    const actualBytes = Buffer.from(match[1]);
    const expectedBytes = Buffer.from(expected);
    return actualBytes.length === expectedBytes.length &&
        timingSafeEqual(actualBytes, expectedBytes);
}
