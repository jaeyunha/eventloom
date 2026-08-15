import { Fragment, type ReactNode } from "react";
import styles from "./portal-workspace.module.css";
import type { PortalResource, PortalWikiPage } from "./types";

type SafeMarkupNode = {
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

function parseSafeMarkup(value: string): readonly SafeMarkupNode[] {
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

function renderNodes(nodes: readonly SafeMarkupNode[]): ReactNode {
  return nodes.map((node) => {
    if (node.text !== undefined) return <Fragment key={node.id}>{node.text}</Fragment>;
    const children = renderNodes(node.children);
    if (node.blocked || node.tag === null) return <Fragment key={node.id}>{children}</Fragment>;
    switch (node.tag) {
      case "a": {
        const href = safePublishedUrl(node.href);
        return href ? (
          <a key={node.id} href={href}>
            {children}
          </a>
        ) : (
          <Fragment key={node.id}>{children}</Fragment>
        );
      }
      case "b":
      case "strong":
        return <strong key={node.id}>{children}</strong>;
      case "blockquote":
        return <blockquote key={node.id}>{children}</blockquote>;
      case "br":
        return <br key={node.id} />;
      case "code":
        return <code key={node.id}>{children}</code>;
      case "del":
      case "s":
        return <del key={node.id}>{children}</del>;
      case "div":
        return <div key={node.id}>{children}</div>;
      case "em":
      case "i":
        return <em key={node.id}>{children}</em>;
      case "h1":
        return <h1 key={node.id}>{children}</h1>;
      case "h2":
        return <h2 key={node.id}>{children}</h2>;
      case "h3":
        return <h3 key={node.id}>{children}</h3>;
      case "h4":
        return <h4 key={node.id}>{children}</h4>;
      case "h5":
        return <h5 key={node.id}>{children}</h5>;
      case "h6":
        return <h6 key={node.id}>{children}</h6>;
      case "hr":
        return <hr key={node.id} />;
      case "li":
        return <li key={node.id}>{children}</li>;
      case "mark":
        return <mark key={node.id}>{children}</mark>;
      case "ol":
        return <ol key={node.id}>{children}</ol>;
      case "p":
        return <p key={node.id}>{children}</p>;
      case "pre":
        return <pre key={node.id}>{children}</pre>;
      case "small":
        return <small key={node.id}>{children}</small>;
      case "span":
        return <span key={node.id}>{children}</span>;
      case "table":
        return <table key={node.id}>{children}</table>;
      case "tbody":
        return <tbody key={node.id}>{children}</tbody>;
      case "td":
        return <td key={node.id}>{children}</td>;
      case "tfoot":
        return <tfoot key={node.id}>{children}</tfoot>;
      case "th":
        return <th key={node.id}>{children}</th>;
      case "thead":
        return <thead key={node.id}>{children}</thead>;
      case "tr":
        return <tr key={node.id}>{children}</tr>;
      case "u":
        return <u key={node.id}>{children}</u>;
      case "ul":
        return <ul key={node.id}>{children}</ul>;
      default:
        return <Fragment key={node.id}>{children}</Fragment>;
    }
  });
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? "Unknown date"
    : new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(date);
}

export function PublishedGuideArticle({
  item,
}: Readonly<{ item: PortalResource | PortalWikiPage }>) {
  const url = safePublishedUrl(item.url);
  return (
    <article className={styles.article}>
      <h2>{item.title}</h2>
      {item.summary ? <p>{item.summary}</p> : null}
      {item.html?.trim() ? <div>{renderNodes(parseSafeMarkup(item.html))}</div> : null}
      {url ? (
        <p>
          <a href={url} target="_blank" rel="noreferrer">
            Open published resource
          </a>
        </p>
      ) : null}
      <small className={styles.meta}>Updated {formatDate(item.updatedAt)}</small>
    </article>
  );
}
