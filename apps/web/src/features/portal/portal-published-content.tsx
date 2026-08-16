import { Fragment, type ReactNode } from "react";
import {
  formatPublishedContentDate,
  parseSafeMarkup,
  safePublishedUrl,
  type SafeMarkupNode,
} from "./portal-published-content-model";
import styles from "./portal-workspace.module.css";
import type { PortalResource, PortalWikiPage } from "./types";

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
      <small className={styles.meta}>Updated {formatPublishedContentDate(item.updatedAt)}</small>
    </article>
  );
}
