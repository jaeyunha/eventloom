import type { ReviewRound, RubricCriterion, VisibleSubmissionReviewMaterial } from "./types";

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

/**
 * Mechanical meaningfulness boundary: length bounds, grounding overlap with the
 * source text, and at least one explanatory token beyond a copy of the source.
 * Quality judgment beyond this belongs to the human reviewer; no word lists.
 */
export function isMeaningfulSuggestionRationale(value: string, groundingText: string): boolean {
  const normalized = normalizeGroundingText(value);
  const tokens = lexicalTokens(normalized);
  const hasNonLatinToken = tokens.some((token) => !/^[\p{Script=Latin}\p{N}]+$/u.test(token));
  if (normalized.length < (hasNonLatinToken ? 12 : 24) || normalized.length > 2_000) return false;

  const alphanumericCount = [...normalized].filter((character) =>
    /[\p{L}\p{N}]/u.test(character),
  ).length;
  if (tokens.length < 5 && alphanumericCount < 20) return false;

  const sourceTokens = significantTokens(groundingText);
  if (sourceTokens.size === 0) return false;
  const rationaleTokens = significantTokens(normalized);
  const overlap = [...sourceTokens].filter((token) => rationaleTokens.has(token)).length;
  if (overlap < Math.min(2, sourceTokens.size)) return false;
  const explanationTokens = [...rationaleTokens].filter((token) => !sourceTokens.has(token));
  return explanationTokens.length >= 1;
}

export function canonicalSubmissionExcerpt(value: string, source: string): string | null {
  if (value.length === 0 || value.length > 500 || value.trim().length === 0) return null;
  if (!source.includes(value)) return null;

  const tokens = lexicalTokens(value);
  if (tokens.length < 3 && !tokens.some((token) => token.length >= 8 || /\d/u.test(token))) {
    return null;
  }
  const controlWords = tokens.filter((token) => PROMPT_CONTROL_WORDS.has(token));
  return controlWords.length === 0 ? value : null;
}

export interface SubmissionExcerptReference {
  readonly source: "title" | "abstract" | "answer";
  readonly excerpt: string;
}

export function parseSubmissionExcerptReference(
  reference: string,
  submission: Readonly<Pick<VisibleSubmissionReviewMaterial, "title" | "abstract" | "answers">>,
): SubmissionExcerptReference | null {
  const separator = reference.indexOf(":");
  if (separator < 1) return null;
  const source = reference.slice(0, separator);
  if (source !== "title" && source !== "abstract" && source !== "answer") return null;
  const excerpt = canonicalSubmissionExcerpt(
    reference.slice(separator + 1),
    source === "answer" ? JSON.stringify(submission.answers) : submission[source],
  );
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
