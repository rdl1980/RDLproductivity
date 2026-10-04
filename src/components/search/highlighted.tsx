import { highlight } from "@/lib/search";

export function Highlighted({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlight(text, query).map((segment, index) =>
        segment.match ? (
          <mark
            key={index}
            className="rounded-sm bg-yellow-200 px-0.5 text-inherit dark:bg-yellow-700"
          >
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  );
}
