import ExcelJS from "exceljs";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import { fields, type Finding } from "./schema";
import { PaceError } from "@/lib/epace/store";
import { readNmap } from "./nmap";

function safeZip(data: Buffer) {
    // Inspect declared expansion before a ZIP parser allocates worksheet contents.
    let end = -1;
    for (let i = data.length - 22; i >= Math.max(0, data.length - 65557); i--)
        if (data.readUInt32LE(i) === 0x06054b50) {
            end = i;
            break;
        }
    if (end < 0) throw new PaceError("This is not a valid XLSX workbook.");
    const count = data.readUInt16LE(end + 10),
        offset = data.readUInt32LE(end + 16);
    if (count > 1500 || count === 65535 || offset >= data.length)
        throw new PaceError("Workbook is too complex. Export a smaller XLSX or CSV file.");
    let size = 0,
        cursor = offset;
    for (let i = 0; i < count; i++) {
        if (cursor + 46 > data.length || data.readUInt32LE(cursor) !== 0x02014b50)
            throw new PaceError("Workbook ZIP directory is invalid.");
        if (data.readUInt16LE(cursor + 8) & 1)
            throw new PaceError("Password-protected workbooks are not supported.");
        size += data.readUInt32LE(cursor + 24);
        if (size > 30_000_000)
            throw new PaceError("Expanded workbook exceeds 30 MB. Export a smaller report.");
        cursor +=
            46 +
            data.readUInt16LE(cursor + 28) +
            data.readUInt16LE(cursor + 30) +
            data.readUInt16LE(cursor + 32);
    }
}
export async function readReport(data: Buffer, name: string, sheet?: string) {
    if (/\.xml$/i.test(name))
        return readNmap(new TextDecoder("utf-8", { fatal: true }).decode(data));
    let matrix: string[][] = [],
        sheets: string[] = [],
        selected = "CSV";
    if (/\.xlsx$/i.test(name)) {
        safeZip(data);
        const book = new ExcelJS.Workbook();
        await book.xlsx.load(data as unknown as ExcelJS.Buffer);
        sheets = book.worksheets.map((s) => s.name);
        const page = sheet ? book.getWorksheet(sheet) : book.worksheets[0];
        if (!page) throw new PaceError("Choose an existing worksheet.");
        if (page.rowCount > 5001 || page.columnCount > 60)
            throw new PaceError("Maximum 5,000 findings and 60 columns per import.");
        selected = page.name;
        page.eachRow({ includeEmpty: true }, (row) => {
            const values: string[] = [];
            for (let i = 1; i <= page.columnCount; i++) {
                const cell = row.getCell(i),
                    value = cell.value;
                values.push(value instanceof Date ? value.toISOString() : cell.text);
            }
            matrix.push(values);
        });
    } else if (/\.csv$/i.test(name)) {
        const input = new TextDecoder("utf-8", { fatal: true }).decode(data);
        matrix = parse(input, {
            bom: true,
            skip_empty_lines: true,
            max_record_size: 250000,
            relax_column_count: true,
        });
    } else throw new PaceError("Upload XLSX, UTF-8 CSV, or Nmap XML.");
    matrix = matrix.filter((r) => r.some((c) => String(c).trim()));
    if (matrix.length < 2)
        throw new PaceError("The report needs a header row and at least one finding.");
    if (matrix.length > 5001 || matrix.some((r) => r.length > 60))
        throw new PaceError("Maximum 5,000 findings and 60 columns per import.");
    const headers = matrix.shift()!.map((c) => String(c).trim());
    if (headers.some((h) => !h) || new Set(headers).size !== headers.length)
        throw new PaceError("Column headers must be non-empty and unique.");
    if (matrix.some((r) => r.length > headers.length))
        throw new PaceError("Some rows have more columns than the header.");
    const rows = matrix.map((r) => headers.map((_, i) => String(r[i] ?? "").trim()));
    if (
        rows.some((r) => r.some((c) => c.length > 8000)) ||
        JSON.stringify(rows).length > 12_000_000
    )
        throw new PaceError("Report text is too large. Split the file into smaller imports.");
    return { headers, rows, sheets, sheet: selected };
}
const clean = (s: unknown) => String(s ?? "").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
export type ScanMetadata = {
    id: string;
    target: string;
    startedAt: string;
    completedAt: string;
    coverage: { tool: string; version: string; status: string; detail: string }[];
};
export function csvReport(findings: Finding[], scan?: ScanMetadata) {
    // CSV has no widths or wrapping settings. Keep a compact, single-line table;
    // XLSX retains the complete styled layout and multiline source text.
    const order = [
        "title",
        "severity",
        "status",
        "url",
        "ip",
        "dns",
        "scanner",
        "qid",
        "cve",
        "cwe",
        "confidence",
        "solution",
        "evidence",
        "threat",
        "impact",
        "vendorReference",
    ];
    const ordered = [...fields].sort(
        (a, b) =>
            (order.includes(a[0]) ? order.indexOf(a[0]) : order.length) -
            (order.includes(b[0]) ? order.indexOf(b[0]) : order.length),
    );
    const selected = ordered.filter(
        ([key]) =>
            ["title", "severity", "status"].includes(key) ||
            findings.some((f) => clean(f.facts[key]).trim()),
    );
    const hasAnalysis = findings.some((f) => f.analysis);
    const headers = [
        "Scope",
        ...selected.map((f) => f[1]),
        "Scan timestamp",
        ...(hasAnalysis
            ? [
                  "AI analysis (advisory)",
                  "AI resolution category",
                  "AI recommendation",
                  "AI priority (advisory)",
                  "AI exploitability (advisory)",
                  "AI possible causes",
                  "AI model",
                  "AI generated at",
              ]
            : []),
    ];
    const rows = findings.map((f) => [
        f.scope,
        ...selected.map(([k]) => f.facts[k]),
        f.scannedAt,
        ...(hasAnalysis
            ? [
                  f.analysis?.analysis,
                  f.analysis?.category,
                  f.analysis?.recommendation,
                  f.analysis?.priority,
                  f.analysis?.exploitability,
                  f.analysis?.causes,
                  f.analysisModel,
                  f.analyzedAt,
              ]
            : []),
    ]);
    const matrix: unknown[][] = scan
        ? [
              [
                  "Record type",
                  "Scan ID",
                  "Target",
                  "Started at",
                  "Completed at",
                  "Coverage / limitations",
                  ...headers,
              ],
              ...scan.coverage.map((c) => [
                  "Coverage",
                  scan.id,
                  scan.target,
                  scan.startedAt,
                  scan.completedAt,
                  `${c.tool} ${c.version} · ${c.status} · ${c.detail}`,
                  ...headers.map(() => ""),
              ]),
              ...rows.map((r) => [
                  "Finding",
                  scan.id,
                  scan.target,
                  scan.startedAt,
                  scan.completedAt,
                  "",
                  ...r,
              ]),
          ]
        : [headers, ...rows];
    return (
        "\uFEFF" +
        stringify(
            matrix.map((row) =>
                row.map((c) => {
                    const text = clean(c)
                        .replace(/[\r\n\t]+/g, " ")
                        .replace(/ {2,}/g, " ")
                        .trim();
                    return /^[=+@-]/.test(text) ? "'" + text : text;
                }),
            ),
            { record_delimiter: "\r\n" },
        )
    );
}
export async function excelReport(findings: Finding[], scan?: ScanMetadata) {
    const book = new ExcelJS.Workbook();
    book.creator = "AIForce.Ops";
    book.created = new Date();
    const summary = book.addWorksheet("Summary");
    summary.columns = [{ width: 32 }, { width: 65 }];
    summary.addRows([
        ["VULNERABILITY REVIEW", "AIForce.Ops · Service Review Center"],
        ["Generated at", new Date().toISOString()],
        ["Findings", findings.length],
        ["Assets", new Set(findings.map((f) => f.facts.ip || f.facts.dns)).size],
        [
            "Critical / high",
            findings.filter((f) => /^(Critical|High)$/.test(f.facts.severity)).length,
        ],
        ["AI analyzed", findings.filter((f) => f.analysis).length],
        [
            "Evidence",
            "Findings contains scanner facts. Analysis contains AI advisory text requiring human review.",
        ],
        [
            "Coverage",
            "This export contains the current filtered selection. Imports do not perform a network scan.",
        ],
        ["Missing values", "Blank cells mean the source did not report a value."],
        ["Remediation", "No remediation is executed by importing or analyzing a report."],
    ]);
    const source = book.addWorksheet("Findings");
    source.columns = [
        { header: "Scope", key: "scope", width: 22 },
        ...fields.map(([key, label]) => ({
            header: label,
            key,
            width:
                key === "vendorReference" || key === "url" || key === "evidence"
                    ? 60
                    : key === "title" || key === "solution" || key === "threat" || key === "impact"
                      ? 46
                      : 22,
        })),
        { header: "Scan timestamp", key: "scannedAt", width: 26 },
    ];
    findings.forEach((f) =>
        source.addRow({
            scope: f.scope,
            ...Object.fromEntries(fields.map(([k]) => [k, clean(f.facts[k])])),
            scannedAt: f.scannedAt,
        }),
    );
    const analysis = book.addWorksheet("Analysis");
    analysis.columns = [
        ["Asset", 25],
        ["Finding", 44],
        ["Scanner severity", 18],
        ["AI analysis (advisory)", 55],
        ["AI resolution category", 23],
        ["AI recommendation", 60],
        ["AI priority (advisory)", 22],
        ["AI exploitability (advisory)", 35],
        ["AI possible causes", 55],
        ["CVE ID (source)", 24],
        ["QID (source)", 20],
        ["AI model", 22],
        ["Generated at", 26],
    ].map(([header, width]) => ({ header: String(header), width: Number(width) }));
    findings.forEach((f) =>
        analysis.addRow(
            [
                f.facts.ip || f.facts.dns,
                f.facts.title,
                f.facts.severity,
                f.analysis?.analysis || "Not analyzed",
                f.analysis?.category,
                f.analysis?.recommendation,
                f.analysis?.priority,
                f.analysis?.exploitability,
                f.analysis?.causes,
                f.facts.cve,
                f.facts.qid,
                f.analysisModel,
                f.analyzedAt,
            ].map(clean),
        ),
    );
    if (scan) {
        summary.addRows([
            ["Scan ID", scan.id],
            ["Target", scan.target],
            ["Started at", scan.startedAt],
            ["Completed at", scan.completedAt],
            [
                "Scope",
                "Unauthenticated public routes plus the configured source checkout. See Coverage for exclusions.",
            ],
        ]);
        summary.getRow(8).getCell(2).value =
            "Immutable results from this completed automated baseline scan. Zero findings does not certify security.";
        const coverage = book.addWorksheet("Coverage");
        coverage.columns = [
            { header: "Tool / area", width: 24 },
            { header: "Version", width: 18 },
            { header: "Status", width: 22 },
            { header: "Coverage / limitations", width: 95 },
        ];
        scan.coverage.forEach((c) => coverage.addRow([c.tool, c.version, c.status, c.detail]));
        const remediation = book.addWorksheet("Remediation");
        remediation.columns = [
            ["Asset / file", 45],
            ["Finding", 45],
            ["Severity", 18],
            ["Resolution category", 24],
            ["Scanner recommendation", 75],
            ["Validation", 30],
            ["Owner", 24],
            ["Retest", 30],
            ["Source", 20],
        ].map(([header, width]) => ({ header: String(header), width: Number(width) }));
        findings.forEach((f) =>
            remediation.addRow(
                [
                    f.facts.url || f.facts.ip || f.facts.dns,
                    f.facts.title,
                    f.facts.severity,
                    /secret|credential/i.test(f.facts.title)
                        ? "Credential review"
                        : f.facts.cve
                          ? "Dependency / patch review"
                          : /header|cookie|configuration/i.test(f.facts.title)
                            ? "Configuration review"
                            : "Investigate",
                    f.facts.solution ||
                        "No scanner recommendation reported; investigate the evidence.",
                    "Scanner reported; not manually validated",
                    "Unassigned",
                    "Not retested",
                    f.facts.scanner,
                ].map(clean),
            ),
        );
    }
    for (const sheet of book.worksheets) {
        sheet.views = [{ state: "frozen", ySplit: 1 }];
        sheet.getRow(1).height = 30;
        sheet.eachRow((row, i) => {
            row.eachCell({ includeEmpty: true }, (cell) => {
                cell.font = {
                    name: "Calibri",
                    size: 11,
                    color: { argb: i === 1 ? "FFFFFFFF" : "FF24324B" },
                };
                cell.alignment = { vertical: "top", wrapText: true };
                cell.fill = {
                    type: "pattern",
                    pattern: "solid",
                    fgColor: { argb: i === 1 ? "FF6250D9" : i % 2 === 0 ? "FFF5F4FC" : "FFFFFFFF" },
                };
                cell.border = { bottom: { style: "hair", color: { argb: "FFE5E7F1" } } };
            });
            if (i > 1) {
                let lines = 1;
                row.eachCell((c, n) => {
                    lines = Math.max(
                        lines,
                        clean(c.text)
                            .split("\n")
                            .reduce(
                                (total, line) =>
                                    total +
                                    Math.max(
                                        1,
                                        Math.ceil(
                                            line.length /
                                                Math.max(10, (sheet.getColumn(n).width || 20) - 4),
                                        ),
                                    ),
                                0,
                            ),
                    );
                });
                row.height = Math.min(409, Math.max(30, lines * 15 + 12));
            }
        });
        if (sheet !== summary)
            sheet.autoFilter = {
                from: { row: 1, column: 1 },
                to: { row: sheet.rowCount, column: sheet.columnCount },
            };
        sheet.pageSetup = {
            orientation: "landscape",
            fitToPage: true,
            fitToWidth: 1,
            fitToHeight: 0,
        };
    }
    return book.xlsx.writeBuffer();
}
