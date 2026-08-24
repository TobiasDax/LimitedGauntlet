import type { ReactNode } from "react";

// Renders a plain-text blurb with clickable links, safely. Everything is
// emitted as React nodes — plain text becomes auto-escaped text nodes and
// ONLY http/https URLs become <a> elements — so there's no raw-HTML / XSS
// surface (no dangerouslySetInnerHTML). Supports bare URLs and Markdown-style
// [label](url) links; newlines are preserved via `whitespace-pre-wrap`.
const TOKEN = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s)]+)/g;

export function RichText({ text, className = "" }: { text: string; className?: string }) {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;

  for (const match of text.matchAll(TOKEN)) {
    const start = match.index ?? 0;
    if (start > lastIndex) nodes.push(text.slice(lastIndex, start));

    const url = match[2] ?? match[3]; // guaranteed http(s) by the regex
    const label = match[1] ?? match[3];
    nodes.push(
      <a
        key={key++}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-accent underline hover:text-accent-strong"
      >
        {label}
      </a>,
    );
    lastIndex = start + match[0].length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));

  return (
    <div className={`text-[14px] leading-relaxed whitespace-pre-wrap text-ink-secondary ${className}`}>{nodes}</div>
  );
}
