import { XMLParser, XMLValidator } from "fast-xml-parser";
import { PaceError } from "@/lib/epace/store";
type Node = Record<string, unknown>;
const object = (v: unknown): Node =>
    v && typeof v === "object" && !Array.isArray(v) ? (v as Node) : {};
const list = (v: unknown): Node[] => (Array.isArray(v) ? v : v ? [v] : []).map(object);
const str = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v) : "");
export function readNmap(xml: string) {
    // Nmap emits a plain DOCTYPE. No custom entities, external DTDs or expansion allowed.
    if (/<!ENTITY/i.test(xml) || /<!DOCTYPE\s+nmaprun\s+(?:SYSTEM|PUBLIC|\[)/i.test(xml))
        throw new PaceError("XML entities and external document types are not supported.");
    const normalized = xml.replace(/<!DOCTYPE\s+nmaprun\s*>/i, "");
    if (/<!DOCTYPE/i.test(normalized) || XMLValidator.validate(normalized) !== true)
        throw new PaceError("Upload a valid Nmap XML result generated with -oX.");
    const parsed = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "",
        parseTagValue: false,
        parseAttributeValue: false,
        processEntities: false,
    }).parse(normalized);
    const run = object(parsed.nmaprun);
    if (run.scanner !== "nmap") throw new PaceError("This XML file is not a Nmap result.");
    const finished = object(object(run.runstats).finished);
    if (finished.exit !== "success")
        throw new PaceError(
            "Nmap did not finish successfully. Complete the scan before importing.",
        );
    const epoch = Number(finished.time || run.start);
    const scannedAt =
        Number.isFinite(epoch) && epoch > 0 ? new Date(epoch * 1000).toISOString() : "";
    const headers = [
        "IP",
        "DNS",
        "Finding ID",
        "Title",
        "Severity",
        "Status",
        "Port",
        "Protocol",
        "Service",
        "Product",
        "Version",
        "Scanner evidence",
        "Scanner",
        "Scan timestamp",
    ];
    const rows: string[][] = [];
    for (const host of list(run.host)) {
        const address =
            list(host.address).find((a) => a.addrtype === "ipv4") ||
            list(host.address).find((a) => a.addrtype === "ipv6");
        const ip = str(address?.addr),
            hostname = str(list(object(host.hostnames).hostname)[0]?.name);
        for (const port of list(object(host.ports).port)) {
            const state = str(object(port.state).state);
            if (!["open", "closed", "filtered", "open|filtered"].includes(state)) continue;
            const service = object(port.service),
                protocol = str(port.protocol),
                number = str(port.portid);
            const evidence = list(port.script)
                .map((s) => `${str(s.id)}: ${str(s.output)}`)
                .join("\n");
            if (evidence.length > 8000)
                throw new PaceError(
                    "A Nmap evidence field exceeds 8,000 characters. Split or simplify the report.",
                );
            rows.push([
                ip,
                hostname,
                `nmap:${protocol}:${number}`,
                `${state === "open" ? "Open port" : state === "closed" ? "Closed port" : "Port observation"} ${number}/${protocol}${service.name ? " · " + str(service.name) : ""}`,
                "Informational",
                state === "closed" ? "Fixed" : state === "open" ? "Active" : "Unknown",
                number,
                protocol,
                str(service.name),
                str(service.product),
                str(service.version),
                evidence,
                "Nmap",
                scannedAt,
            ]);
            if (rows.length > 5000)
                throw new PaceError("Nmap import supports up to 5,000 port observations.");
        }
    }
    if (!rows.length)
        throw new PaceError(
            "No individual port observations were reported. Nmap may have summarized all ports as closed or filtered; there are no findings to import.",
        );
    return { headers, rows, sheets: [], sheet: "Nmap", scannedAt };
}
