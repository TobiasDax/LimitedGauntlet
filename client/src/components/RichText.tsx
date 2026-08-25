import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";

// Renders a Markdown blurb (PI-31) — headings, ordered/unordered lists,
// bold/italic/underline, tables, code, blockquotes, links — safely.
//
// XSS posture (unchanged from PI-8's intent): react-markdown emits React nodes,
// never dangerouslySetInnerHTML for the Markdown itself. rehype-raw lets a
// couple of literal HTML tags through (so `<u>` underline works, since Markdown
// has no underline syntax), but rehype-sanitize runs AFTER it and strips
// everything to a strict allowlist — the schema below drops `img` (no external
// image / file-embed surface, per "no file uploads") and adds only `u`. Links
// are additionally forced to open in a new tab with noopener/noreferrer.
const schema: typeof defaultSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []).filter((t) => t !== "img"), "u"],
};

export function RichText({ text, className = "" }: { text: string; className?: string }) {
  return (
    <div className={`markdown text-[14px] leading-relaxed text-ink-secondary ${className}`}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, schema]]}
        components={{
          a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
        }}
      >
        {text}
      </Markdown>
    </div>
  );
}
