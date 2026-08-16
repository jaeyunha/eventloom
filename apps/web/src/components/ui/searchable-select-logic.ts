export interface SearchableSelectOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
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
