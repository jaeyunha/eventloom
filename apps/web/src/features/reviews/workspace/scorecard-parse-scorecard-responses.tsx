"use client";

export function parseScorecardResponses(comment: string): {
  readonly comment: string;
  readonly responses: Readonly<Record<string, string>>;
} {
  const responses: Record<string, string> = {};
  const cleanComment = comment.replace(
    /\n?\[scorecard-response id="([^"]*)"\]([\s\S]*?)\[\/scorecard-response\]/gu,
    (_match, id: string, value: string) => {
      responses[id] = value.trim();
      return "";
    },
  );
  return { comment: cleanComment.trim(), responses };
}
