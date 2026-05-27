// Reusable hooks: one-shot fetch, polling, SSE. Keep API surface tiny so it's
// obvious what each call does in the components.

import { useEffect, useRef, useState, useCallback } from 'react';

export function useFetch(fn, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fn();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, deps);
  useEffect(() => { reload(); }, [reload]);
  return { data, error, loading, reload };
}

export function usePoll(fn, intervalMs, deps = []) {
  const state = useFetch(fn, deps);
  const ref = useRef(state.reload);
  ref.current = state.reload;
  useEffect(() => {
    const id = setInterval(() => ref.current(), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, ...deps]);
  return state;
}

export function useSSE(connect, onMessage) {
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;
  useEffect(() => {
    const disconnect = connect((msg) => handlerRef.current(msg));
    return disconnect;
  }, [connect]);
}
