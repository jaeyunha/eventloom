import type { ReviewRound, RubricCriterion, VisibleSubmissionReviewMaterial } from "./types";

const GENERIC_RATIONALES = new Set([
  "bad",
  "excellent",
  "good",
  "highly relevant",
  "irrelevant",
  "looks good",
  "no",
  "relevant",
  "strong evidence",
  "this proposal looks good overall",
  "weak evidence",
  "yes",
]);

const GROUNDING_STOP_WORDS = new Set([
  "abstract",
  "about",
  "answer",
  "answers",
  "being",
  "criterion",
  "criteria",
  "from",
  "good",
  "have",
  "into",
  "proposal",
  "quality",
  "rating",
  "relevance",
  "relevant",
  "score",
  "session",
  "strong",
  "submission",
  "that",
  "these",
  "this",
  "those",
  "weak",
  "with",
]);

const RATIONALE_TEMPLATE_WORDS = new Set([
  ...GROUNDING_STOP_WORDS,
  "based",
  "demonstrates",
  "evidence",
  "indicates",
  "recommendation",
  "selected",
  "shows",
  "support",
  "supported",
  "supporting",
  "supports",
  "value",
]);

const EXPLANATORY_RELATION_WORDS = new Set([
  "addresses",
  "because",
  "connects",
  "demonstrates",
  "enables",
  "explains",
  "gives",
  "identifies",
  "illustrates",
  "indicates",
  "offers",
  "provides",
  "shows",
  "since",
  "supports",
  "帮助",
  "体现",
  "对应",
  "展示",
  "提供",
  "表明",
  "解释",
  "证明",
  "ช่วย",
  "เชื่อมโยง",
  "แสดง",
  "อธิบาย",
  "สอดคล้อง",
  "สนับสนุน",
  "ให้",
]);

const EXPLANATORY_IMPACT_PATTERNS = [
  /audience.{0,40}(benefit|outcome|value)/u,
  /(benefit|outcome|value).{0,40}(audience|attendees)/u,
  /practical.{0,40}(applicability|guidance|material|value)/u,
  /implementation.{0,40}(detail|plan|specificity)/u,
  /program.{0,40}(fit|relevance|value)/u,
  /(criterion|score).{0,40}(alignment|basis|fit|impact|justification)/u,
  /concrete.{0,40}(benefit|detail|guidance|outcome)/u,
  /具体.{0,20}依据/u,
  /直接.{0,20}(对应|主题)/u,
  /活动.{0,20}主题/u,
  /นำไปใช้ได้จริง/u,
  /สอดคล้อง.{0,30}หัวข้อ/u,
  /แนวทาง.{0,30}ทีม/u,
] as const;

const ALLOWED_EXPLANATION_WORDS = new Set([
  ...EXPLANATORY_RELATION_WORDS,
  "alignment",
  "applicability",
  "attendees",
  "basis",
  "benefit",
  "concrete",
  "criterion",
  "detail",
  "directly",
  "fit",
  "focus",
  "grounded",
  "guidance",
  "impact",
  "implementation",
  "justification",
  "measurable",
  "operational",
  "outcome",
  "plan",
  "program",
  "reason",
  "recommendation",
  "reviewers",
  "source",
  "specificity",
  "依据",
  "具体",
  "活动",
  "直接",
  "主题",
  "ที่",
  "กับ",
  "จริง",
  "งาน",
  "นำ",
  "แนวทาง",
  "ไป",
  "โดยตรง",
  "สามารถ",
  "หัวข้อ",
]);

const PROMPT_CONTROL_WORDS = new Set([
  "award",
  "criterion",
  "developer",
  "disregard",
  "follow",
  "highest",
  "ignore",
  "instruction",
  "instructions",
  "json",
  "output",
  "override",
  "previous",
  "prior",
  "return",
  "score",
  "system",
]);

const WORD_SEGMENTER =
  typeof Intl.Segmenter === "function" ? new Intl.Segmenter("und", { granularity: "word" }) : null;

export function scoreableRubricCriteria(round: ReviewRound): readonly RubricCriterion[] {
  return round.rubric.criteria.filter(
    (criterion) => (criterion.inputType ?? "numeric") !== "free_text",
  );
}

export function isMeaningfulSuggestionRationale(value: string, groundingText: string): boolean {
  const normalized = normalizeGroundingText(value);
  const tokens = lexicalTokens(normalized);
  const hasNonLatinToken = tokens.some((token) => !/^[\p{Script=Latin}\p{N}]+$/u.test(token));
  if (normalized.length < (hasNonLatinToken ? 12 : 24) || normalized.length > 2_000) return false;
  if (GENERIC_RATIONALES.has(normalized.replace(/[.!?]+$/gu, ""))) return false;

  const alphanumericCount = [...normalized].filter((character) =>
    /[\p{L}\p{N}]/u.test(character),
  ).length;
  if (tokens.length < 5 && alphanumericCount < 20) return false;

  const sourceTokens = significantTokens(groundingText);
  if (sourceTokens.size === 0) return false;
  const rationaleTokens = significantTokens(normalized);
  if (!tokens.some((token) => EXPLANATORY_RELATION_WORDS.has(token))) return false;
  if (!EXPLANATORY_IMPACT_PATTERNS.some((pattern) => pattern.test(normalized))) return false;
  const overlap = [...sourceTokens].filter((token) => rationaleTokens.has(token)).length;
  if (overlap < Math.min(2, sourceTokens.size)) return false;
  const explanationTokens = [...rationaleTokens].filter(
    (token) => !sourceTokens.has(token) && !RATIONALE_TEMPLATE_WORDS.has(token),
  );
  return (
    explanationTokens.length >= 2 &&
    explanationTokens.every((token) => ALLOWED_EXPLANATION_WORDS.has(token))
  );
}

export function canonicalSubmissionExcerpt(value: string, source: string): string | null {
  if (value.length === 0 || value.length > 500 || value.trim().length === 0) return null;
  if (!source.includes(value)) return null;

  const tokens = lexicalTokens(value);
  if (tokens.length < 3 && !tokens.some((token) => token.length >= 8 || /\d/u.test(token))) {
    return null;
  }
  const controlWords = tokens.filter((token) => PROMPT_CONTROL_WORDS.has(token));
  const topicalWords = tokens.filter(
    (token) => !PROMPT_CONTROL_WORDS.has(token) && !GROUNDING_STOP_WORDS.has(token),
  );
  return controlWords.length < 2 || topicalWords.length >= 2 ? value : null;
}

export interface SubmissionExcerptReference {
  readonly source: "title" | "abstract";
  readonly excerpt: string;
}

export function parseSubmissionExcerptReference(
  reference: string,
  submission: Readonly<Pick<VisibleSubmissionReviewMaterial, "title" | "abstract">>,
): SubmissionExcerptReference | null {
  const separator = reference.indexOf(":");
  if (separator < 1) return null;
  const source = reference.slice(0, separator);
  if (source !== "title" && source !== "abstract") return null;
  const excerpt = canonicalSubmissionExcerpt(reference.slice(separator + 1), submission[source]);
  return excerpt === null ? null : { source, excerpt };
}

function significantTokens(value: string): ReadonlySet<string> {
  return new Set(
    lexicalTokens(value).filter(
      (token) => isSignificantToken(token) && !GROUNDING_STOP_WORDS.has(token),
    ),
  );
}

function lexicalTokens(value: string): string[] {
  const normalized = normalizeGroundingText(value);
  if (WORD_SEGMENTER === null) return normalized.match(/[\p{L}\p{N}]+/gu) ?? [];
  return [...WORD_SEGMENTER.segment(normalized)]
    .filter((segment) => segment.isWordLike)
    .map((segment) => segment.segment);
}

function isSignificantToken(token: string): boolean {
  const length = [...token].length;
  return /^[\p{Script=Latin}\p{N}]+$/u.test(token) ? length >= 4 : length >= 2;
}

function normalizeGroundingText(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US");
}
