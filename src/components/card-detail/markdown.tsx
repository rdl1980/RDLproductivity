import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Renders user markdown. Raw HTML is not rendered, so the output is safe. */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose prose-sm max-w-none break-words dark:prose-invert">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // eslint-disable-next-line @typescript-eslint/no-unused-vars -- drop `node` from DOM props
          a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
