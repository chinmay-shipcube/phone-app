import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import type { Me, PublicSettings } from '../../../shared/types';
import { api } from '../api/client';

export function useMe() {
  return useQuery<Me | null>({
    queryKey: ['me'],
    queryFn: () => api.get<Me | null>('/auth/me'),
    staleTime: 60_000,
  });
}

export function usePublicSettings(enabled = true) {
  return useQuery<PublicSettings>({
    queryKey: ['settings', 'public'],
    queryFn: () => api.get('/settings/public'),
    enabled,
    staleTime: 60_000,
  });
}

/** Clears everything cached and returns to the login screen. */
export function useLogout() {
  const qc = useQueryClient();
  return useCallback(async () => {
    await api.post('/auth/logout').catch(() => {});
    signedOut(qc);
  }, [qc]);
}

/** When any call answers 401 (session ended), go back to login. */
export function useSessionWatcher() {
  const qc = useQueryClient();
  useEffect(() => {
    const onOut = () => signedOut(qc);
    window.addEventListener('cd:logged-out', onOut);
    return () => window.removeEventListener('cd:logged-out', onOut);
  }, [qc]);
}

/**
 * Drops every cached answer except the "me" query, then sets it to null. Clearing "me" too would
 * detach the screen that is watching it, so it would keep showing the old user.
 */
function signedOut(qc: QueryClient) {
  qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
  qc.setQueryData(['me'], null);
}
