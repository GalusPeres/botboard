// Reusable hooks: one-shot fetch, polling, SSE. Keep API surface tiny so it's
// obvious what each call does in the components.

import { useEffect, useRef, useState, useCallback } from 'react';

export function useFetch(fn, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const hasDataRef = useRef(false);
  const reload = useCallback(async () => {
    if (!hasDataRef.current) setLoading(true);
    try {
      const result = await fn();
      hasDataRef.current = true;
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

// Route lives in the URL hash (#/sb/board) so a browser refresh keeps the
// current page and back/forward navigate within the app instead of jumping
// back out to the OAuth screen.
export function useHashRoute(defaultRoute = 'overview') {
  const parse = () => window.location.hash.replace(/^#\/?/, '') || defaultRoute;
  const [route, setRouteState] = useState(parse);

  useEffect(() => {
    const sync = () => setRouteState(parse());
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, []);

  const setRoute = useCallback((next) => {
    if (next === parse()) return;
    window.location.hash = '/' + next;
  }, []);

  return [route, setRoute];
}

export function useCloseOnOutside(ref, open, onClose) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;

    const closeOutside = (event) => {
      if (!ref.current?.contains(event.target)) onCloseRef.current(event);
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') onCloseRef.current(event);
    };

    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [ref, open]);
}
