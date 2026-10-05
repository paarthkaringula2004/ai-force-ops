export const metrics = [
  "groundedness",
  "relevance",
  "fluency",
  "coherence",
] as const;
export const categories = ["Violence", "Hate", "Sexual", "Self-harm"] as const;
export type Settings = {
  model: string;
  evaluationModel: string;
  retrieval: "Hybrid" | "Keyword" | "Semantic";
  semanticRanker: boolean;
  semanticCaptions: boolean;
  contentSafety: boolean;
  thresholds: Record<string, number>;
  sampling: number;
  retention: number;
  prompt: string;
  filterId: string;
  tags: string[];
};
export const defaultSettings: Settings = {
  model: "",
  evaluationModel: "",
  retrieval: "Keyword",
  semanticRanker: false,
  semanticCaptions: false,
  contentSafety: true,
  thresholds: { groundedness: 3, relevance: 3, fluency: 3, coherence: 3 },
  sampling: 0.1,
  retention: 30,
  prompt:
    "Answer from the supplied knowledge. State clearly when evidence is missing. Cite source numbers in square brackets.",
  filterId: "",
  tags: [],
};
export type Project = {
  id: string;
  name: string;
  settings: Settings;
  created_at: string;
  updated_at: string;
};
export type Kind =
  | "document"
  | "thread"
  | "run"
  | "filter"
  | "component"
  | "assessment"
  | "alert"
  | "prompt"
  | "template"
  | "radar";
export type RecordRow = {
  id: string;
  project_id: string;
  kind: Kind;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};
export type Source = {
  id: string;
  documentId: string;
  name: string;
  content: string;
  score: number;
  caption?: string;
};
export type Span = {
  name: string;
  kind: "retrieval" | "llm" | "moderation" | "evaluation";
  start: string;
  duration: number;
  inputTokens?: number;
  outputTokens?: number;
  error?: string;
};
export type Moderation = {
  stage: string;
  latency: number;
  blocked: boolean;
  categories: Record<
    string,
    { score: number; severity: string; flagged: boolean }
  >;
  blocklist: string[];
};
export type RunData = {
  name: string;
  threadId: string;
  input: string;
  output: string;
  model: string;
  status: "pending" | "success" | "error" | "blocked";
  error?: string;
  start: string;
  end?: string;
  latency?: number;
  ttft?: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  streamed: boolean;
  sources: Source[];
  spans: Span[];
  moderation: Moderation[];
  feedback?: Record<string, number>;
  evaluation?: {
    scores: Record<string, number>;
    reason: string;
    model: string;
  };
  evaluationError?: string;
  tags: string[];
  settings: Settings;
};
export type Snapshot = {
  projects: Project[];
  project: Project | null;
  records: RecordRow[];
  audit: { id: string; action: string; created_at: string }[];
  providerReady: boolean;
  checkedAt: string;
};
