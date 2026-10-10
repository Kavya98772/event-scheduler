import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api.js';

export function useFetch(path) {
  const [state, setState] = useState({ data: null, loading: !!path, error: null });
  const load = useCallback(() => {
    if (!path) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    api.get(path).then((data) => setState({ data, loading: false, error: null }))
      .catch((e) => setState({ data: null, loading: false, error: e.message }));
  }, [path]);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}
