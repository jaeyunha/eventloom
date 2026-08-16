export type SafeMarkupNode = {
  readonly id: string;
  readonly tag: string | null;
  readonly href?: string;
  readonly children: SafeMarkupNode[];
  readonly text?: string;
  readonly blocked?: boolean;
};

const blockedTags = new Set([
  "base",
  "embed",
  "iframe",
  "link",
  "meta",
  "object",
  "script",
  "style",
  "svg",
  "template",
]);
const voidTags = new Set(["br", "hr"]);
const PUBLISHED_CONTENT_DATE_FORMATTER = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
});

export function safePublishedUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, "https://portal.invalid");
    return url.protocol === "http:" || url.protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

function decodeEntities(value: string): string {
  const named: Readonly<Record<string, string>> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  return value.replace(
    /&(#(?:x[\da-f]+|\d+)|amp|apos|gt|lt|nbsp|quot);/gi,
    (entity, reference: string) => {
      if (!reference.startsWith("#")) return named[reference.toLowerCase()] ?? entity;
      const hexadecimal = reference[1]?.toLowerCase() === "x";
      const codePoint = Number.parseInt(
        reference.slice(hexadecimal ? 2 : 1),
        hexadecimal ? 16 : 10,
      );
      return Number.isFinite(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : entity;
    },
  );
}

function hrefFrom(source: string): string | undefined {
  const match = source.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i);
  return match ? decodeEntities(match[1] ?? match[2] ?? match[3] ?? "") : undefined;
}

export function parseSafeMarkup(value: string): readonly SafeMarkupNode[] {
  const root: SafeMarkupNode = { id: "root", tag: null, children: [] };
  const stack: SafeMarkupNode[] = [root];
  for (const match of value.matchAll(/<!--[\s\S]*?-->|<\/?[a-z][^>]*>|[^<]+/gi)) {
    const token = match[0];
    const parent = stack.at(-1);
    if (!parent || token.startsWith("<!--")) continue;
    if (token.startsWith("</")) {
      const tag = token.match(/^<\/\s*([a-z][a-z0-9-]*)/i)?.[1]?.toLowerCase();
      if (!tag) continue;
      for (let index = stack.length - 1; index > 0; index -= 1) {
        if (stack[index]?.tag === tag) {
          stack.splice(index);
          break;
        }
      }
      continue;
    }
    const opening = token.match(/^<\s*([a-z][a-z0-9-]*)\b([^>]*)>/i);
    if (!opening) {
      parent.children.push({
        id: `text-${match.index}`,
        tag: null,
        children: [],
        text: decodeEntities(token),
      });
      continue;
    }
    const tag = opening[1]?.toLowerCase();
    if (!tag) continue;
    const href = tag === "a" ? hrefFrom(opening[2] ?? "") : undefined;
    const node: SafeMarkupNode = {
      id: `node-${match.index}`,
      tag,
      children: [],
      ...(href === undefined ? {} : { href }),
      blocked: blockedTags.has(tag),
    };
    parent.children.push(node);
    if (!voidTags.has(tag)) stack.push(node);
  }
  return root.children;
}

export function formatPublishedContentDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? "Unknown date"
    : PUBLISHED_CONTENT_DATE_FORMATTER.format(date);
}
