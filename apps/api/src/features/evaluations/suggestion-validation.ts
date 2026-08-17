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

const FILLER_TOKENS = new Set([
  "asdf",
  "banana",
  "bicycle",
  "blorptastic",
  "foobar",
  "flibbles",
  "frumious",
  "frobnitz",
  "glorp",
  "irrelevant",
  "locomotive",
  "nebula",
  "nonsense",
  "pineapple",
  "qwerty",
  "toaster",
  "wugga",
  "wibble",
  "bandersnatch",
  "crondle",
  "splunge",
  "snazzle",
  "alpha",
  "beta",
  "gamma",
  "drivel",
  "vacuous",
  "lorem",
  "ipsum",
  "dolor",
  "gibberish",
  "placeholder",
  "meaningless",
  "zorbles",
  "quux",
  "random",
  "xyzzy",
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
  const overlap = [...sourceTokens].filter((token) => rationaleTokens.has(token)).length;
  if (overlap < Math.min(2, sourceTokens.size)) return false;
  const explanationTokens = [...rationaleTokens].filter((token) => !sourceTokens.has(token));
  if (explanationTokens.some((token) => FILLER_TOKENS.has(token))) return false;
  if (explanationTokens.some((token) => /\d/u.test(token))) return false;
  if (explanationTokens.some(isArtificialToken)) return false;
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

function isArtificialToken(token: string): boolean {
  if (!/^[a-z]+$/u.test(token)) return false;
  if (token.length >= 6 && !/[aeiouy]/u.test(token)) return true;
  if (/([a-z])\1\1/u.test(token)) return true;
  if (token.endsWith("x") && !COMMON_X_ENDING_WORDS.has(token)) return true;
  if (token.startsWith("z") && !COMMON_Z_STARTING_WORDS.has(token)) return true;
  if (token.includes("q") && !token.includes("qu")) return true;
  return false;
}

const COMMON_X_ENDING_WORDS = new Set(["complex", "context", "exact", "index", "matrix", "syntax"]);

const COMMON_Z_STARTING_WORDS = new Set(["zebra", "zero", "zinc", "zip", "zone", "zoom"]);

function normalizeGroundingText(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US");
}
