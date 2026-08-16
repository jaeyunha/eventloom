export type RichTextCommand =
  | "bold"
  | "italic"
  | "underline"
  | "bulleted-list"
  | "numbered-list"
  | "link";

export interface RichTextCommandResult {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

function wrapSelection(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  before: string,
  after: string,
  placeholder: string,
): RichTextCommandResult {
  const selected = value.slice(selectionStart, selectionEnd) || placeholder;
  const replacement = `${before}${selected}${after}`;
  const nextValue = `${value.slice(0, selectionStart)}${replacement}${value.slice(selectionEnd)}`;
  const selectedStart = selectionStart + before.length;

  return {
    value: nextValue,
    selectionStart: selectedStart,
    selectionEnd: selectedStart + selected.length,
  };
}

export function applyRichTextCommand(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  command: RichTextCommand,
): RichTextCommandResult {
  if (command === "bold") {
    return wrapSelection(value, selectionStart, selectionEnd, "**", "**", "bold text");
  }
  if (command === "italic") {
    return wrapSelection(value, selectionStart, selectionEnd, "_", "_", "italic text");
  }
  if (command === "underline") {
    return wrapSelection(value, selectionStart, selectionEnd, "<u>", "</u>", "underlined text");
  }
  if (command === "link") {
    return wrapSelection(value, selectionStart, selectionEnd, "[", "](https://)", "link text");
  }

  const selected = value.slice(selectionStart, selectionEnd) || "List item";
  const lines = selected.split("\n");
  const replacement = lines
    .map((line, index) => (command === "numbered-list" ? `${index + 1}. ${line}` : `- ${line}`))
    .join("\n");
  const nextValue = `${value.slice(0, selectionStart)}${replacement}${value.slice(selectionEnd)}`;

  return {
    value: nextValue,
    selectionStart,
    selectionEnd: selectionStart + replacement.length,
  };
}
