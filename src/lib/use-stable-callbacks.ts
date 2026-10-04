import { useLayoutEffect, useRef, useState } from "react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic callback bag
type Callbacks = Record<string, (...args: any[]) => unknown>;

/**
 * Returns an object with the same methods whose identity never changes, while
 * always calling the latest implementation. Lets memoized children receive
 * callbacks without re-rendering on every parent render.
 */
export function useStableCallbacks<T extends Callbacks>(callbacks: T): T {
  const latest = useRef(callbacks);
  useLayoutEffect(() => {
    latest.current = callbacks;
  });
  const [stable] = useState(() => {
    const result = {} as Callbacks;
    for (const key of Object.keys(callbacks)) {
      result[key] = (...args: unknown[]) => latest.current[key](...args);
    }
    return result as T;
  });
  return stable;
}
