/** Remove empty spacing paragraphs introduced by pasted rich text, outside code fences. */
export function cleanChatMarkdown(value: string) {
    let fenced = false;
    return value
        .split("\n")
        .filter((line) => {
            if (/^\s*(```|~~~)/.test(line)) {
                fenced = !fenced;
                return true;
            }
            return fenced || !/^\s*(?:(?:&nbsp;|&#160;|&#x0*a0;|\u00a0)\s*)+$/i.test(line);
        })
        .join("\n")
        .trim();
}
