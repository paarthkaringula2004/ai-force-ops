export const fields = [
    ["ip", "IP address", "IP,IP Address,Asset IP"],
    ["dns", "DNS / hostname", "DNS,Hostname,Host,Device,FQDN"],
    ["qid", "Finding ID / QID", "QID,Plugin ID,Finding ID"],
    ["title", "Finding title", "Title,Name,Vulnerability,Vulnerability Name"],
    ["severity", "Severity", "Severity,Priority,Priority Rating"],
    ["status", "Finding status", "Vuln Status,Vulnerability Status,Status"],
    ["cve", "CVE ID", "CVE ID,CVE,CVEs"],
    ["os", "Operating system", "OS,Operating System"],
    ["port", "Port", "Port"],
    ["protocol", "Protocol", "Protocol"],
    ["firstDetected", "First detected", "First Detected,First Seen"],
    ["lastDetected", "Last detected", "Last Detected,Last Seen"],
    ["cvss", "CVSS score", "CVSS3.1,CVSS,CVSS Score,CVSS3.1 Base"],
    ["threat", "Threat", "Threat"],
    ["impact", "Impact", "Impact"],
    ["solution", "Scanner solution", "Solution,Remediation,Resolution recommendation"],
    ["exploitability", "Scanner exploitability", "Exploitability"],
    ["netbios", "NetBIOS", "NetBIOS"],
    ["timesDetected", "Times detected", "Times Detected"],
    ["vendorReference", "Vendor reference", "Vendor Reference"],
    ["scanner", "Scanner", "Scanner,Source tool"],
    ["url", "Affected URL / file", "URL,Affected URL,Affected URL / file,File"],
    ["cwe", "CWE ID", "CWE,CWE ID"],
    ["confidence", "Confidence", "Confidence"],
    ["evidence", "Scanner evidence", "Scanner evidence,Evidence"],
] as const;
export type Field = (typeof fields)[number][0];
export type Facts = Record<Field, string> & { raw: Record<string, string> };
export type Analysis = {
    analysis: string;
    category: string;
    recommendation: string;
    priority: string;
    exploitability: string;
    causes: string;
};
export type Finding = {
    id: string;
    scope: string;
    facts: Facts;
    scannedAt: string;
    analysis: Analysis | null;
    analysisModel: string | null;
    analyzedAt: string | null;
    updatedAt: string;
};
export type Mapping = Partial<Record<Field, string>>;
export function guessMapping(headers: string[]): Mapping {
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    return Object.fromEntries(
        fields.map(([key, , aliases]) => [
            key,
            headers.find((h) => aliases.split(",").some((a) => normalize(a) === normalize(h))) ||
                "",
        ]),
    );
}
