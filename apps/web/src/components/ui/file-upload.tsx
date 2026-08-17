"use client";

import { CloudUpload, Trash2, X } from "lucide-react";
import {
  type ChangeEvent,
  type DragEvent,
  type Ref,
  type ReactNode,
  useId,
  useRef,
  useState,
} from "react";
import { Button } from "./button";
import styles from "./file-upload.module.css";
import { Progress } from "./progress";

export type FileUploadItemStatus = "selected" | "uploading" | "complete" | "error";

export interface FileUploadItem {
  readonly id: string;
  readonly name: string;
  readonly sizeLabel: string;
  readonly status: FileUploadItemStatus;
  readonly badge?: string;
  readonly progress?: number;
  readonly message?: string;
  readonly removable?: boolean;
}

export interface FileUploadProps {
  readonly id?: string;
  readonly accept?: string | undefined;
  readonly multiple?: boolean;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly name?: string;
  readonly title?: string;
  readonly hint?: string;
  readonly browseLabel?: string;
  readonly describedBy?: string | undefined;
  readonly ariaLabel?: string;
  readonly invalid?: boolean;
  readonly inputRef?: Ref<HTMLInputElement> | undefined;
  readonly files?: readonly FileUploadItem[];
  readonly emptyState?: ReactNode;
  readonly onFilesSelected: (files: readonly File[]) => void;
  readonly onRemove?: (id: string) => void;
}

export function fileUploadBadge(fileName: string): string {
  const extension = fileName.includes(".") ? fileName.slice(fileName.lastIndexOf(".") + 1) : "";
  const normalized = extension.replace(/[^a-z0-9]/giu, "").slice(0, 4);
  return normalized.length > 0 ? normalized.toUpperCase() : "FILE";
}

export function formatFileUploadSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "Unknown size";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 102.4) / 10} KB`;
  return `${Math.round(bytes / 104_857.6) / 10} MB`;
}

function statusCopy(item: FileUploadItem): string {
  if (item.message) return item.message;
  if (item.status === "uploading") return `${item.sizeLabel} · Uploading…`;
  if (item.status === "complete") return `${item.sizeLabel} · Completed`;
  if (item.status === "error") return item.sizeLabel;
  return item.sizeLabel;
}

export function FileUpload({
  id,
  accept,
  multiple = false,
  required = false,
  disabled = false,
  name,
  title = "Drop your files here or browse",
  hint,
  browseLabel = "Browse file",
  describedBy,
  ariaLabel,
  invalid = false,
  inputRef,
  files = [],
  emptyState,
  onFilesSelected,
  onRemove,
}: FileUploadProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const localInputRef = useRef<HTMLInputElement | null>(null);
  const [active, setActive] = useState(false);

  function assignInput(node: HTMLInputElement | null): void {
    localInputRef.current = node;
    if (typeof inputRef === "function") {
      inputRef(node);
      return;
    }
    if (inputRef && "current" in inputRef) {
      inputRef.current = node;
    }
  }

  function takeFiles(list: FileList | readonly File[] | null | undefined): void {
    if (!list) return;
    const next = Array.from(list);
    if (next.length === 0) return;
    onFilesSelected(multiple ? next : next.slice(0, 1));
    if (localInputRef.current) localInputRef.current.value = "";
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    takeFiles(event.currentTarget.files);
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>): void {
    event.preventDefault();
    setActive(false);
    if (disabled) return;
    takeFiles(event.dataTransfer.files);
  }

  return (
    <div className={styles.root} data-file-upload="">
      <label
        className={styles.dropzone}
        data-active={active ? "true" : undefined}
        data-disabled={disabled ? "true" : undefined}
        htmlFor={inputId}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!disabled) setActive(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setActive(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setActive(false);
          }
        }}
        onDrop={handleDrop}
      >
        <span className={styles.icon} aria-hidden="true">
          <CloudUpload size={20} />
        </span>
        <p className={styles.title}>{title}</p>
        {hint ? <p className={styles.hint}>{hint}</p> : null}
        <p className={styles.browse}>{browseLabel}</p>
        <input
          ref={assignInput}
          id={inputId}
          className={styles.input}
          type="file"
          accept={accept}
          multiple={multiple}
          required={required && files.length === 0}
          disabled={disabled}
          name={name}
          aria-label={ariaLabel}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          onChange={handleChange}
        />
      </label>
      {files.length > 0 ? (
        <ul className={styles.list} aria-label="Selected files">
          {files.map((item) => {
            const canRemove = item.removable !== false && onRemove !== undefined;
            return (
              <li className={styles.item} data-status={item.status} key={item.id}>
                <span className={styles.badge}>{item.badge ?? fileUploadBadge(item.name)}</span>
                <div className={styles.copy}>
                  <strong className={styles.name}>{item.name}</strong>
                  <span className={styles.meta}>{statusCopy(item)}</span>
                </div>
                {canRemove ? (
                  <Button
                    className={styles.action}
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={
                      item.status === "uploading" ? `Cancel ${item.name}` : `Remove ${item.name}`
                    }
                    onClick={() => onRemove(item.id)}
                  >
                    {item.status === "uploading" ? (
                      <X aria-hidden="true" />
                    ) : (
                      <Trash2 aria-hidden="true" />
                    )}
                  </Button>
                ) : (
                  <span />
                )}
                {item.status === "uploading" && item.progress !== undefined ? (
                  <Progress className={styles.progress} value={item.progress} />
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        emptyState
      )}
    </div>
  );
}
