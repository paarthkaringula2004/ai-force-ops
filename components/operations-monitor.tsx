"use client";
import { useEffect } from "react";
export default function OperationsMonitor() {
  useEffect(() => {
    let last = 0;
    const report = () => {
      if (Date.now() - last < 60000) return;
      last = Date.now();
      // Never transmit message text, stack traces, query strings or secrets.
      void fetch("/api/eassist/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: window.location.pathname }),
        keepalive: true,
      }).catch(() => {});
    };
    const error = (event: ErrorEvent) => {
      if (event.error || event.message) report();
    };
    window.addEventListener("error", error);
    window.addEventListener("unhandledrejection", report);
    return () => {
      window.removeEventListener("error", error);
      window.removeEventListener("unhandledrejection", report);
    };
  }, []);
  return null;
}
