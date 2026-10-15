import { readFile } from "node:fs/promises";
import path from "node:path";
import { BRIEF_CHAT_STYLE } from "./chat-efficiency";

const overviewFile = "AIForce-Ops-Project-and-Meeting-Analysis.md";

export async function playgroundInstructions(customInstructions: string, question = "What can AIForce.Ops do?"): Promise<string> {
  const overview = await readFile(path.join(process.cwd(), overviewFile), "utf8");
  const sections = overview.split(/(?=^## )/m).filter(section => section.trim());
  const words = question.toLowerCase().match(/[a-z][a-z0-9.-]{2,}/g) ?? [];
  const meaningful = words.filter(word => !["what","this","that","with","have","does","about","project","aiforce","ops","can","our","the","you","your","are","how","and","for","please"].includes(word));
  const broad = /what.*(aiforce|project|website|capabilit|can.*do)|about.*(project|website|aiforce)|overview/i.test(question);
  const relevant = sections.slice(2).map(section => ({ section, score: meaningful.filter(word => section.toLowerCase().includes(word)).length }))
    .filter(item => item.score > 0).sort((a, b) => b.score - a.score).slice(0, 2).map(item => item.section);
  const context = [sections[1]?.split("\n\n").slice(0, 2).join("\n\n"), ...(broad ? sections.slice(2).filter(section => !/^## (Communicating|Running)/.test(section)).map(section => section.split("\n\n").slice(0, 2).join("\n\n")) : relevant)].join("\n\n");
  return [
    "You are AIForce.Ops’s product assistant, speaking directly to its users. The project facts below are maintained by the application, not supplied by the user. Explain the product confidently and accurately; never say ‘the overview you provided’, ‘based on your information’, or imply the user wrote these facts.",
    "For a broad product-overview question, explain AIForce.Ops and its relevant features in plain language. For a narrow question or follow-up, answer that specific question directly; do not substitute a generic product introduction. Use concise paragraphs or a short list. Do not recite internal documentation, taxonomy uncertainty, implementation caveats or developer details unless the question concerns those details. Never invent implemented features.",
    "Answer the question completely and stop. Do not add generic offers such as ‘If you want, I can tailor this’ or ‘Let me know’. Ask a follow-up only when required information is missing to fulfill the request.",
    "Project descriptions do not require a live-access disclaimer. Playground has no live operational tools: never claim to have checked health, repaired a workflow, connected a tool or downloaded a report. Only when asked for current health or an action, explain the specific limitation briefly and direct the user to Review Center’s Super assistant. Distinguish historical results from current evidence.",
    "<project_overview>",
    context,
    "</project_overview>",
    BRIEF_CHAT_STYLE,
    customInstructions ? `Session instructions:\n${customInstructions}` : "Be helpful and specific to the user's question.",
  ].join("\n\n");
}
