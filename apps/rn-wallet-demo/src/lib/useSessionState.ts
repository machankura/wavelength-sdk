import { useCallback, useState } from 'react';

const session = new Map<string, unknown>();

// useSessionState is useState for wallet session state that must live as long
// as the engine. Android's Back key destroys the activity but not the process,
// so the engine at module scope and its daemon carry on while the React root is
// rebuilt on return. Plain component state would forget which wallet is open,
// and a recovery phrase still waiting to be confirmed, while the wallet stays up.
export function useSessionState<T>(
  key: string,
  initial: T,
): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(() =>
    session.has(key) ? (session.get(key) as T) : initial,
  );
  const set = useCallback(
    (next: T) => {
      session.set(key, next);
      setValue(next);
    },
    [key],
  );

  return [value, set];
}
