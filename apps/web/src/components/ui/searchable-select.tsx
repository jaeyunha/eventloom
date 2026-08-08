"use client";

import {
  type ChangeEvent,
  type FocusEvent,
  type KeyboardEvent,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import styles from "../../styles/design-system.module.css";
import { cx } from "./class-names";

export interface SearchableSelectOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export interface SearchableSelectProps {
  options: readonly SearchableSelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  id?: string;
  name?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  ariaLabel?: string;
  labelledBy?: string;
  describedBy?: string;
  invalid?: boolean;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}

export function filterOptions(
  options: readonly SearchableSelectOption[],
  query: string,
): SearchableSelectOption[] {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) {
    return [...options];
  }

  return options.filter((option) =>
    normalize(`${option.label} ${option.description ?? ""}`).includes(normalizedQuery),
  );
}

function nextEnabledIndex(
  options: readonly SearchableSelectOption[],
  currentIndex: number,
  direction: 1 | -1,
): number {
  if (options.length === 0) {
    return -1;
  }

  for (let offset = 1; offset <= options.length; offset += 1) {
    const candidate = (currentIndex + direction * offset + options.length) % options.length;
    if (!options[candidate]?.disabled) {
      return candidate;
    }
  }

  return -1;
}

export function SearchableSelect({
  options,
  value,
  defaultValue = "",
  onValueChange,
  id,
  name,
  placeholder = "Select an option",
  searchPlaceholder = "Search…",
  emptyMessage = "No matching options",
  ariaLabel,
  labelledBy,
  describedBy,
  invalid = false,
  required = false,
  disabled = false,
  className,
}: SearchableSelectProps) {
  const generatedId = useId();
  const inputId = id ?? `searchable-select-${generatedId}`;
  const listId = `${inputId}-listbox`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const selectedValue = value === undefined ? internalValue : value;
  const selectedOption = options.find((option) => option.value === selectedValue);
  const visibleOptions = useMemo(() => filterOptions(options, query), [options, query]);

  function openList() {
    if (disabled) {
      return;
    }
    setOpen(true);
    setQuery("");
    const selectedIndex = visibleOptions.findIndex((option) => option.value === selectedValue);
    setActiveIndex(
      selectedIndex >= 0 && !visibleOptions[selectedIndex]?.disabled
        ? selectedIndex
        : nextEnabledIndex(visibleOptions, -1, 1),
    );
  }

  function selectOption(option: SearchableSelectOption) {
    if (option.disabled) {
      return;
    }
    if (value === undefined) {
      setInternalValue(option.value);
    }
    onValueChange?.(option.value);
    setQuery("");
    setOpen(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  }

  function handleInput(event: ChangeEvent<HTMLInputElement>) {
    setQuery(event.currentTarget.value);
    setOpen(true);
    const filtered = filterOptions(options, event.currentTarget.value);
    setActiveIndex(nextEnabledIndex(filtered, -1, 1));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        openList();
        return;
      }
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex(nextEnabledIndex(visibleOptions, activeIndex, direction));
      return;
    }

    if (event.key === "Enter" && open && activeIndex >= 0) {
      event.preventDefault();
      const option = visibleOptions[activeIndex];
      if (option) {
        selectOption(option);
      }
      return;
    }

    if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
      setQuery("");
      setActiveIndex(-1);
    }
  }

  function handleBlur(event: FocusEvent<HTMLFieldSetElement>) {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return;
    }
    setOpen(false);
    setQuery("");
    setActiveIndex(-1);
  }

  const activeOptionId = open && activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined;
  const displayValue = open ? query : (selectedOption?.label ?? "");

  return (
    <fieldset
      aria-label={ariaLabel ? `${ariaLabel} select` : "Searchable select"}
      className={cx(styles.combo, className)}
      onBlur={handleBlur}
    >
      {name ? <input name={name} type="hidden" value={selectedValue} /> : null}
      <div className={styles.comboControl}>
        <input
          aria-activedescendant={activeOptionId}
          aria-autocomplete="list"
          aria-controls={listId}
          aria-describedby={describedBy}
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          aria-label={ariaLabel}
          aria-labelledby={labelledBy}
          aria-required={required || undefined}
          autoComplete="off"
          className={styles.comboInput}
          disabled={disabled}
          id={inputId}
          onChange={handleInput}
          onClick={() => (open ? undefined : openList())}
          onFocus={() => (open ? undefined : openList())}
          onKeyDown={handleKeyDown}
          placeholder={open ? searchPlaceholder : placeholder}
          ref={inputRef}
          role="combobox"
          value={displayValue}
        />
        <svg
          aria-hidden="true"
          className={styles.comboChevron}
          height="16"
          viewBox="0 0 16 16"
          width="16"
        >
          <path
            d="m4 6 4 4 4-4"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
          />
        </svg>
      </div>
      {open ? (
        <div className={styles.comboList} id={listId} role="listbox">
          {visibleOptions.length === 0 ? (
            <div className={styles.comboEmpty} role="status">
              {emptyMessage}
            </div>
          ) : (
            visibleOptions.map((option, index) => (
              <button
                aria-disabled={option.disabled || undefined}
                aria-selected={option.value === selectedValue}
                className={cx(
                  styles.comboOption,
                  index === activeIndex && styles.comboOptionActive,
                  option.value === selectedValue && styles.comboOptionSelected,
                )}
                disabled={option.disabled}
                id={`${listId}-option-${index}`}
                key={option.value}
                onClick={() => selectOption(option)}
                role="option"
                tabIndex={-1}
                type="button"
              >
                {option.label}
                {option.description ? (
                  <span className={styles.comboOptionDescription}>{option.description}</span>
                ) : null}
              </button>
            ))
          )}
        </div>
      ) : null}
    </fieldset>
  );
}
