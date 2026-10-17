import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { DOMParser } from "@xmldom/xmldom";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
const source = await readFile(new URL("../lib/epace/markdown.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, {
    compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
    },
}).outputText;
const { elementToMarkdown, clipboardMarkdown } = await import(
    "data:text/javascript;base64," + Buffer.from(js).toString("base64")
);
const parse = (html) => new DOMParser().parseFromString(html, "text/html").documentElement;
let checks = 0;
const pass = (name) => {
    checks++;
    console.log("PASS " + name);
};
const word = elementToMarkdown(
    parse(
        '<div><h2>Operations review</h2><p><strong>Important</strong> <em>evidence</em></p><ul><li>First item</li><li>Second item</li></ul><p class="MsoListParagraph">\u2022 Word bullet</p></div>',
    ),
);
assert.match(word, /## Operations review/);
assert.match(word, /\*\*Important\*\*/);
assert.match(word, /\*evidence\*/);
assert.match(word, /- First item/);
assert.match(word, /- Word bullet/);
pass("Word headings, emphasis and list formatting become Markdown");
const table = elementToMarkdown(
    parse(
        "<div><table><tr><td>Service</td><td>Status</td></tr><tr><td>API | worker</td><td>Healthy</td></tr></table></div>",
    ),
);
assert.match(table, /\| Service \| Status \|/);
assert.match(table, /\| --- \| --- \|/);
assert.ok(table.includes("API \\| worker"));
pass("pasted tables become valid Markdown with escaped cell separators");
const code = elementToMarkdown(
    parse(
        "<div><pre>const value = 1;\nconsole.log(value);</pre><p>Use <code>value</code>.</p></div>",
    ),
);
assert.match(code, /```\nconst value = 1;/);
assert.match(code, /`value`/);
pass("code blocks and inline code preserve their content");
const safe = elementToMarkdown(
    parse(
        '<div><script>alert(1)</script><p><a href="javascript:alert(1)">Unsafe</a> <a href="https://example.org/info">Evidence</a></p><img src="https://invalid.example/image"/><iframe src="https://invalid.example"></iframe></div>',
    ),
);
assert.doesNotMatch(safe, /javascript:|alert\(|invalid.example/);
assert.match(safe, /\[Evidence\]\(https:\/\/example.org\/info\)/);
pass("pasted executable markup and unsafe links are excluded");
const plain = "# Heading\n\n**Important**\n\n| A | B |\n| --- | --- |\n| 1 | 2 |";
assert.equal(clipboardMarkdown("<p>ignored</p>", plain), plain);
assert.equal(clipboardMarkdown("", plain), plain);
pass("existing Markdown copied as text is preserved without rewriting");
const rendered = renderToStaticMarkup(
    React.createElement(
        ReactMarkdown,
        {
            remarkPlugins: [remarkGfm],
        },
        word + "\n\n" + table + "\n\n" + code,
    ),
);
assert.match(rendered, /<h2>Operations review<\/h2>/);
assert.match(rendered, /<strong>Important<\/strong>/);
assert.match(rendered, /<table>/);
assert.match(rendered, /<pre><code>/);
pass("input and output renderer supports headings, emphasis, tables and code");
console.log(`Completed ${checks} Markdown verification checks.`);
