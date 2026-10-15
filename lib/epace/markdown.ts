// Convert inert clipboard markup into Markdown; never mount or execute pasted HTML.
export function elementToMarkdown(root: Element): string {
  const children = (node: Node): string =>
    Array.from(node.childNodes).map(convert).join("");
  const convert = (node: Node): string => {
    if (node.nodeType === 3)
      return (node.textContent || "").replace(/\u00a0/g, " ");
    if (node.nodeType !== 1) return "";
    const el = node as Element,
      tag = el.tagName.toLowerCase(),
      value = children(el);
    if (
      [
        "script",
        "style",
        "meta",
        "link",
        "iframe",
        "object",
        "img",
        "svg",
      ].includes(tag)
    )
      return "";
    if (/^h[1-6]$/.test(tag))
      return `\n\n${"#".repeat(Number(tag[1]))} ${value.trim()}\n\n`;
    if (tag === "span" && /font-weight:\s*(bold|[7-9]00)/i.test(el.getAttribute("style") || ""))return `**${value.trim()}**`;
    if (tag === "span" && /font-style:\s*italic/i.test(el.getAttribute("style") || ""))return `*${value.trim()}*`;
    if (tag === "strong" || tag === "b") return `**${value.trim()}**`;
    if (tag === "em" || tag === "i") return `*${value.trim()}*`;
    if (tag === "s" || tag === "del") return `~~${value.trim()}~~`;
    if (tag === "br") return "\n";
    if (tag === "pre") {
      const text = el.textContent || "",
        fence = text.includes("```") ? "````" : "```";
      return `\n\n${fence}\n${text.trimEnd()}\n${fence}\n\n`;
    }
    if (tag === "code")
      return el.parentNode?.nodeName.toLowerCase() === "pre"
        ? value
        : `${value.includes("`") ? "``" : "`"}${value}${value.includes("`") ? "``" : "`"}`;
    if (tag === "a") {
      const href = el.getAttribute("href") || "";
      return /^(https?:\/\/|mailto:)/i.test(href) && !/[\s<>]/.test(href)
        ? `[${value.trim()}](${href.replace(/\)/g, "%29")})`
        : value;
    }
    if (tag === "ul" || tag === "ol") {
      const items = Array.from(el.childNodes).filter(
        (n) => n.nodeName.toLowerCase() === "li",
      );
      return (
        "\n\n" +
        items
          .map(
            (n, i) =>
              `${tag === "ol" ? `${i + 1}.` : "-"} ${children(n).trim().replace(/\n/g, "\n  ")}`,
          )
          .join("\n") +
        "\n\n"
      );
    }
    if (tag === "blockquote")
      return (
        "\n\n" +
        value
          .trim()
          .split("\n")
          .map((line) => "> " + line)
          .join("\n") +
        "\n\n"
      );
    if (tag === "table") {
      const rows = Array.from(el.getElementsByTagName("tr"))
        .map((row) =>
          Array.from(row.childNodes)
            .filter((n) => /^(td|th)$/i.test(n.nodeName))
            .map((n) =>
              children(n).trim().replace(/\|/g, "\\|").replace(/\n+/g, " "),
            ),
        )
        .filter((row) => row.length);
      if (!rows.length) return "";
      const width = Math.max(...rows.map((r) => r.length)),
        line = (r: string[]) =>
          "| " +
          Array.from({ length: width }, (_, i) => r[i] || "").join(" | ") +
          " |";
      return (
        "\n\n" +
        [
          line(rows[0]),
          line(Array(width).fill("---")),
          ...rows.slice(1).map(line),
        ].join("\n") +
        "\n\n"
      );
    }
    if (tag === "p" || tag === "div") {
      const list = /MsoListParagraph|mso-list/i.test(
        (el.getAttribute("class") || "") +
          " " +
          (el.getAttribute("style") || ""),
      );
      const text = value.trim();
      return list
        ? "\n" + text.replace(/^[\s\u2022\u00b7]+/, "- ") + "\n"
        : "\n\n" + text + "\n\n";
    }
    return value;
  };
  return children(root)
    .replace(/\n[ \t]+\n/g, "\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
export function clipboardMarkdown(html: string, plain: string): string {
  // Markdown copied as text is already the desired format.
  if (
    !html ||
    /^\s{0,3}(#{1,6} |```|\|.+\|)/m.test(plain) ||
    /\*\*[^*]+\*\*/.test(plain)
  )
    return plain;
  const template = document.createElement("template");
  template.innerHTML = html;
  const root = document.createElement("div");
  root.appendChild(template.content.cloneNode(true));
  return elementToMarkdown(root) || plain;
}
