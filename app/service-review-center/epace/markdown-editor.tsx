"use client";

import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import Placeholder from "@tiptap/extension-placeholder";
import { TableKit } from "@tiptap/extension-table";
import { Bold, Check, ChevronDown, Italic, Link2 } from "lucide-react";
import ThemedSelect from "@/components/themed-select";
import { clipboardMarkdown } from "@/lib/epace/markdown";
import { Extension, posToDOMRect } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";

const MessageLimit = Extension.create({
    name: "messageLimit",
    addOptions() {
        return { maxLength: 12000 };
    },
    addProseMirrorPlugins() {
        const editor = this.editor;
        const maxLength = this.options.maxLength;
        return [
            new Plugin({
                filterTransaction(transaction) {
                    return (
                        !transaction.docChanged ||
                        editor.markdown!.serialize(transaction.doc.toJSON()).length <= maxLength
                    );
                },
            }),
        ];
    },
});

export default function MarkdownEditor({
    value,
    onChange,
    onSend,
    maxLength = 12000,
    ariaLabel = "Type a new question",
    placeholder = "Type a new question…",
    templateMenu,
    onTemplateChoice,
    documentMode = false,
}: {
    value: string;
    onChange: (value: string) => void;
    onSend: () => void;
    maxLength?: number;
    ariaLabel?: string;
    placeholder?: string;
    templateMenu?: { key: string; label: string; choices?: string[] }[];
    onTemplateChoice?: (key: string, value: string) => void;
    documentMode?: boolean;
}) {
    const callbacks = useRef({ onChange, onSend });
    useEffect(() => {
        callbacks.current = { onChange, onSend };
    }, [onChange, onSend]);
    const [menu, setMenu] = useState(false);
    const [linkOpen, setLinkOpen] = useState(false);
    const [url, setUrl] = useState("");
    const toolbar = useRef<HTMLDivElement>(null);
    const dismissed = useRef(false);
    const [context, setContext] = useState<{
        x: number;
        y: number;
        from: number;
        to: number;
    } | null>(null);
    const contextRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const close = (event: PointerEvent) => {
            if (
                !contextRef.current?.contains(event.target as Node) &&
                !(event.target as Element)?.closest?.(".themed-select-popup")
            )
                setContext(null);
        };
        const escape = (event: KeyboardEvent) => {
            if (event.key === "Escape") setContext(null);
        };
        document.addEventListener("pointerdown", close);
        document.addEventListener("keydown", escape);
        return () => {
            document.removeEventListener("pointerdown", close);
            document.removeEventListener("keydown", escape);
        };
    }, []);
    const editor = useEditor({
        immediatelyRender: false,
        extensions: [
            StarterKit.configure({
                heading: { levels: [1, 2, 3] },
                link: { openOnClick: false },
                underline: false,
            }),
            Markdown,
            MessageLimit.configure({ maxLength }),
            TableKit,
            Placeholder.configure({ placeholder }),
        ],
        content: value,
        contentType: "markdown",
        editorProps: {
            attributes: {
                role: "textbox",
                "aria-label": ariaLabel,
                "aria-multiline": "true",
                class: "pace-rich-input pace-answer-content",
            },
            handleKeyDown: (_view, event) => {
                if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                    event.preventDefault();
                    callbacks.current.onSend();
                    return true;
                }
                return false;
            },
            handlePaste: (view, event) => {
                const plain = event.clipboardData?.getData("text/plain") || "";
                const html = event.clipboardData?.getData("text/html") || "";
                if (!plain && !html) return false;
                event.preventDefault();
                const selected = view.state.doc.textBetween(
                    view.state.selection.from,
                    view.state.selection.to,
                ).length;
                const room = Math.max(0, maxLength - view.state.doc.textContent.length + selected);
                editor?.commands.insertContent(clipboardMarkdown(html, plain).slice(0, room), {
                    contentType: "markdown",
                });
                return true;
            },
        },
        onUpdate: ({ editor: current }) => {
            callbacks.current.onChange(current.getMarkdown());
        },
    });
    const active = useEditorState({
        editor,
        selector: ({ editor: current }) => ({
            bold: current?.isActive("bold"),
            italic: current?.isActive("italic"),
            link: current?.isActive("link"),
            block: current?.isActive("heading", { level: 1 })
                ? "Heading 1"
                : current?.isActive("heading", { level: 2 })
                  ? "Heading 2"
                  : current?.isActive("heading", { level: 3 })
                    ? "Heading 3"
                    : current?.isActive("orderedList")
                      ? "Numbered list"
                      : current?.isActive("bulletList")
                        ? "Bulleted list"
                        : "Text",
        }),
    });
    useEffect(() => {
        if (editor && value !== editor.getMarkdown())
            editor.commands.setContent(value, {
                contentType: "markdown",
                emitUpdate: false,
            });
    }, [editor, value]);
    useEffect(() => {
        const close = (event: PointerEvent) => {
            if (!toolbar.current?.contains(event.target as Node)) {
                setMenu(false);
                setLinkOpen(false);
                dismissed.current = !!editor && !editor.view.dom.contains(event.target as Node);
                if (editor && dismissed.current)
                    editor.view.dispatch(editor.state.tr.setMeta("bubbleMenu", "hide"));
            }
        };
        const escape = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setMenu(false);
                setLinkOpen(false);
                dismissed.current = true;
                if (editor) editor.view.dispatch(editor.state.tr.setMeta("bubbleMenu", "hide"));
            }
        };
        document.addEventListener("pointerdown", close);
        document.addEventListener("keydown", escape);
        return () => {
            document.removeEventListener("pointerdown", close);
            document.removeEventListener("keydown", escape);
        };
    }, [editor]);
    if (!editor) return <div className="pace-rich-editor" />;
    function format(label: string) {
        if (!editor) return;
        const chain = editor.chain().focus();
        if (label === "Text") chain.clearNodes().setParagraph().run();
        else if (label.startsWith("Heading"))
            chain.setHeading({ level: Number(label.slice(-1)) as 1 | 2 | 3 }).run();
        else if (label === "Numbered list") chain.toggleOrderedList().run();
        else chain.toggleBulletList().run();
        setMenu(false);
    }
    return (
        <div
            className={`pace-rich-editor ${documentMode ? "workspace-document-editor" : ""}`}
            onContextMenu={(event) => {
                if (!templateMenu && !documentMode) return;
                event.preventDefault();
                const position = editor.view.posAtCoords({
                    left: event.clientX,
                    top: event.clientY,
                })?.pos;
                let { from, to } = editor.state.selection;
                if (position !== undefined) {
                    const resolved = editor.state.doc.resolve(position),
                        text = resolved.parent.textBetween(0, resolved.parent.content.size, "\n");
                    const match = [
                        ...text.matchAll(
                            /\{\{[^{}]+\}\}|Choose (?:role|position|department|employment type|work location|joining date|reporting manager|candidate name|candidate email)/gi,
                        ),
                    ].find(
                        (m) =>
                            resolved.parentOffset >= m.index! &&
                            resolved.parentOffset <= m.index! + m[0].length,
                    );
                    if (match) {
                        from = resolved.start() + match.index!;
                        to = from + match[0].length;
                    } else if (from === to || position < from || position > to) {
                        from = position;
                        to = position;
                    }
                }
                setContext({
                    x: Math.max(8, Math.min(event.clientX, window.innerWidth - 340)),
                    y: Math.max(8, Math.min(event.clientY, window.innerHeight - 400)),
                    from,
                    to,
                });
            }}
        >
            {documentMode && (
                <div
                    className="workspace-document-toolbar"
                    role="toolbar"
                    aria-label="Instruction formatting"
                    onMouseDown={(e) => {
                        if (!(e.target instanceof HTMLSelectElement)) e.preventDefault();
                    }}
                >
                    <button
                        type="button"
                        aria-label="Bold instructions"
                        aria-pressed={active?.bold || false}
                        onClick={() => editor.chain().focus().toggleBold().run()}
                    >
                        <Bold size={16} />
                    </button>
                    <button
                        type="button"
                        aria-label="Italic instructions"
                        aria-pressed={active?.italic || false}
                        onClick={() => editor.chain().focus().toggleItalic().run()}
                    >
                        <Italic size={16} />
                    </button>
                    <button
                        type="button"
                        aria-label="Strikethrough instructions"
                        onClick={() => editor.chain().focus().toggleStrike().run()}
                    >
                        <s>S</s>
                    </button>
                    {[
                        "Text",
                        "Heading 1",
                        "Heading 2",
                        "Heading 3",
                        "Bulleted list",
                        "Numbered list",
                    ].map((label) => (
                        <button
                            type="button"
                            key={label}
                            aria-pressed={active?.block === label}
                            onClick={() => format(label)}
                        >
                            {label}
                        </button>
                    ))}
                    <button
                        type="button"
                        onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
                    >
                        Clear format
                    </button>
                </div>
            )}
            <EditorContent editor={editor} />
            {documentMode && (
                <p className="workspace-editor-hint">
                    Paste formatted text from Word or Markdown. Select text or right-click to
                    format. Ctrl+B / Ctrl+I · Ctrl+Enter to save.
                </p>
            )}
            {context && (templateMenu || documentMode) && (
                <div
                    ref={contextRef}
                    role="dialog"
                    aria-label={documentMode ? "Text formatting" : "Insert document field"}
                    className={documentMode ? "workspace-format-menu" : ""}
                    onMouseDown={(e) => {
                        if (documentMode && !(e.target instanceof HTMLInputElement))
                            e.preventDefault();
                    }}
                    style={{
                        position: "fixed",
                        left: context.x,
                        top: context.y,
                        zIndex: 200,
                        width: 320,
                        maxHeight: "min(380px,80vh)",
                        overflowY: "auto",
                        padding: 12,
                        background: "white",
                        border: "1px solid #dedbf5",
                        borderRadius: 14,
                        boxShadow: "0 12px 40px #25326230",
                    }}
                >
                    <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 10 }}>
                        {documentMode ? "Text formatting" : "Insert a field · choose an option"}
                    </p>
                    {documentMode && (
                        <>
                            <div className="workspace-context-actions">
                                {[
                                    "Bold",
                                    "Italic",
                                    "Strikethrough",
                                    "Text",
                                    "Heading 1",
                                    "Heading 2",
                                    "Heading 3",
                                    "Bulleted list",
                                    "Numbered list",
                                    "Clear format",
                                ].map((label) => (
                                    <button
                                        type="button"
                                        key={label}
                                        onClick={() => {
                                            editor
                                                .chain()
                                                .focus()
                                                .setTextSelection({
                                                    from: context.from,
                                                    to: context.to,
                                                })
                                                .run();
                                            if (label === "Bold")
                                                editor.chain().focus().toggleBold().run();
                                            else if (label === "Italic")
                                                editor.chain().focus().toggleItalic().run();
                                            else if (label === "Strikethrough")
                                                editor.chain().focus().toggleStrike().run();
                                            else if (label === "Clear format")
                                                editor
                                                    .chain()
                                                    .focus()
                                                    .unsetAllMarks()
                                                    .clearNodes()
                                                    .run();
                                            else format(label);
                                            setContext(null);
                                        }}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                            <label className="workspace-link-label">
                                Link address
                                <input
                                    aria-label="Instruction link address"
                                    placeholder="https://…"
                                    value={url}
                                    onChange={(e) => setUrl(e.target.value)}
                                />
                            </label>
                            <button
                                type="button"
                                className="workspace-link-apply"
                                onClick={() => {
                                    if (url.trim() && !/^(https?:\/\/|mailto:)/i.test(url.trim()))
                                        return;
                                    const chain = editor
                                        .chain()
                                        .focus()
                                        .setTextSelection({ from: context.from, to: context.to });
                                    if (url.trim()) chain.setLink({ href: url.trim() }).run();
                                    else chain.unsetLink().run();
                                    setContext(null);
                                }}
                            >
                                {url.trim() ? "Apply link" : "Remove link"}
                            </button>
                        </>
                    )}
                    {templateMenu?.map((item) => (
                        <div key={item.key} style={{ marginBottom: 8 }}>
                            <button
                                type="button"
                                style={{
                                    fontSize: 13,
                                    color: "#6255e8",
                                    padding: 6,
                                    textAlign: "left",
                                    width: "100%",
                                }}
                                onClick={() => {
                                    editor
                                        .chain()
                                        .focus()
                                        .insertContentAt(
                                            { from: context.from, to: context.to },
                                            "{{" + item.key + "}}",
                                        )
                                        .run();
                                    setContext(null);
                                }}
                            >
                                Choose {item.label.toLowerCase()}
                            </button>
                            {item.choices?.length ? (
                                <ThemedSelect
                                    aria-label={"Choose " + item.label.toLowerCase()}
                                    defaultValue=""
                                    style={{
                                        width: "100%",
                                        padding: 8,
                                        border: "1px solid #e2e5ef",
                                        borderRadius: 8,
                                        fontSize: 12,
                                    }}
                                    onChange={(event) => {
                                        if (!event.target.value) return;
                                        editor
                                            .chain()
                                            .focus()
                                            .insertContentAt(
                                                { from: context.from, to: context.to },
                                                "{{" + item.key + "}}",
                                            )
                                            .run();
                                        onTemplateChoice?.(item.key, event.target.value);
                                        setContext(null);
                                    }}
                                >
                                    <option value="">Select {item.label.toLowerCase()}…</option>
                                    {item.choices.map((value) => (
                                        <option key={value}>{value}</option>
                                    ))}
                                </ThemedSelect>
                            ) : null}
                        </div>
                    ))}
                </div>
            )}
            <BubbleMenu
                editor={editor}
                pluginKey="bubbleMenu"
                shouldShow={({ editor: current }) =>
                    !dismissed.current && current.isFocused && !current.state.selection.empty
                }
                appendTo={() =>
                    editor.view.dom.closest<HTMLElement>('[role="dialog"]') || document.body
                }
                getReferencedVirtualElement={() => ({
                    // Keep selection coordinates in the editor's DOM context when the
                    // menu is portalled into a positioned chat dialog.
                    contextElement: editor.view.dom,
                    getBoundingClientRect: () =>
                        posToDOMRect(
                            editor.view,
                            editor.state.selection.from,
                            editor.state.selection.to,
                        ),
                })}
                options={{
                    placement: "top-start",
                    strategy: "absolute",
                    offset: 8,
                    flip: {
                        boundary:
                            editor.view.dom.closest<HTMLElement>('[role="dialog"]') || undefined,
                        padding: 12,
                    },
                    shift: {
                        boundary:
                            editor.view.dom.closest<HTMLElement>('[role="dialog"]') || undefined,
                        padding: 12,
                    },
                }}
            >
                <div
                    className={`pace-selection-toolbar ${documentMode ? "workspace-document-bubble" : ""}`}
                    ref={toolbar}
                    role="toolbar"
                    aria-label="Format selected text"
                    onMouseDown={(event) => {
                        if (!(event.target instanceof HTMLInputElement)) event.preventDefault();
                    }}
                >
                    <button
                        type="button"
                        aria-label="Add link"
                        aria-pressed={active?.link || false}
                        onClick={() => {
                            setUrl(editor.getAttributes("link").href || "");
                            setLinkOpen(!linkOpen);
                            setMenu(false);
                        }}
                    >
                        <Link2 size={18} />
                    </button>
                    <button
                        type="button"
                        aria-label="Bold"
                        aria-pressed={active?.bold || false}
                        onClick={() => editor.chain().focus().toggleBold().run()}
                    >
                        <Bold size={18} />
                    </button>
                    <button
                        type="button"
                        aria-label="Italic"
                        aria-pressed={active?.italic || false}
                        onClick={() => editor.chain().focus().toggleItalic().run()}
                    >
                        <Italic size={18} />
                    </button>
                    <button
                        type="button"
                        className="pace-text-style"
                        aria-haspopup="menu"
                        aria-expanded={menu}
                        onClick={() => {
                            setMenu(!menu);
                            setLinkOpen(false);
                        }}
                    >
                        {active?.block || "Text"}
                        <ChevronDown size={14} />
                    </button>
                    {menu && (
                        <div className="pace-style-menu" role="menu" aria-label="Text style">
                            {[
                                "Text",
                                "Heading 1",
                                "Heading 2",
                                "Heading 3",
                                "Numbered list",
                                "Bulleted list",
                            ].map((label) => (
                                <button
                                    type="button"
                                    role="menuitemradio"
                                    aria-checked={active?.block === label}
                                    key={label}
                                    onClick={() => format(label)}
                                >
                                    {label}
                                    {active?.block === label && <Check size={16} />}
                                </button>
                            ))}
                        </div>
                    )}
                    {linkOpen && (
                        <div className="pace-link-menu">
                            <input
                                aria-label="Link address"
                                placeholder="https://…"
                                value={url}
                                onChange={(event) => setUrl(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter") event.preventDefault();
                                }}
                            />
                            <button
                                type="button"
                                onClick={() => {
                                    if (!url.trim()) editor.chain().focus().unsetLink().run();
                                    else if (/^(https?:\/\/|mailto:)/i.test(url.trim()))
                                        editor.chain().focus().setLink({ href: url.trim() }).run();
                                    else return;
                                    setLinkOpen(false);
                                }}
                            >
                                {url.trim() ? "Apply" : "Remove"}
                            </button>
                        </div>
                    )}
                </div>
            </BubbleMenu>
        </div>
    );
}
