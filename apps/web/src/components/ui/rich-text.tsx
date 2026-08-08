"use client";

import {
  useRef,
  useState,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import styles from "../../styles/design-system.module.css";
import { cx } from "./class-names";

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

const commands: ReadonlyArray<{
  command: RichTextCommand;
  label: string;
  symbol: string;
}> = [
  { command: "bold", label: "Bold", symbol: "B" },
  { command: "italic", label: "Italic", symbol: "I" },
  { command: "underline", label: "Underline", symbol: "U" },
  { command: "bulleted-list", label: "Bulleted list", symbol: "•" },
  { command: "numbered-list", label: "Numbered list", symbol: "1." },
  { command: "link", label: "Insert link", symbol: "↗" },
];

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

export interface RichTextShellProps {
  children: ReactNode;
  onCommand?: (command: RichTextCommand) => void;
  disabled?: boolean;
  toolbarLabel?: string;
  className?: string;
  footer?: ReactNode;
}

export function RichTextShell({
  children,
  onCommand,
  disabled = false,
  toolbarLabel = "Formatting options",
  className,
  footer,
}: RichTextShellProps) {
  return (
    <div className={cx(styles.richText, className)}>
      <div aria-label={toolbarLabel} className={styles.toolbar} role="toolbar">
        {commands.map(({ command, label, symbol }) => (
          <button
            aria-label={label}
            className={styles.toolbarButton}
            disabled={disabled || !onCommand}
            key={command}
            onClick={() => onCommand?.(command)}
            title={label}
            type="button"
          >
            <span aria-hidden="true">{symbol}</span>
          </button>
        ))}
      </div>
      {children}
      {footer ? <div className={styles.richTextMeta}>{footer}</div> : null}
    </div>
  );
}

export interface RichTextAreaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "defaultValue" | "onChange" | "value"> {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  toolbarLabel?: string;
}

export function RichTextArea({
  value,
  defaultValue = "",
  onValueChange,
  toolbarLabel,
  className,
  disabled,
  maxLength,
  ...props
}: RichTextAreaProps) {
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const [internalValue, setInternalValue] = useState(defaultValue);
  const editorValue = value === undefined ? internalValue : value;

  function updateValue(nextValue: string) {
    if (value === undefined) {
      setInternalValue(nextValue);
    }
    onValueChange?.(nextValue);
  }

  function handleCommand(command: RichTextCommand) {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    const result = applyRichTextCommand(
      editorValue,
      editor.selectionStart,
      editor.selectionEnd,
      command,
    );
    updateValue(result.value);
    requestAnimationFrame(() => {
      editor.focus();
      editor.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
  }

  return (
    <RichTextShell
      disabled={Boolean(disabled)}
      footer={maxLength === undefined ? null : `${editorValue.length}/${maxLength}`}
      onCommand={handleCommand}
      toolbarLabel={toolbarLabel ?? "Formatting options"}
    >
      <textarea
        className={cx(styles.richTextEditor, className)}
        disabled={disabled}
        maxLength={maxLength}
        onChange={(event) => updateValue(event.currentTarget.value)}
        ref={editorRef}
        value={editorValue}
        {...props}
      />
    </RichTextShell>
  );
}
