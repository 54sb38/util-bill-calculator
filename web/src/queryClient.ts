import { MutationCache, QueryClient } from '@tanstack/react-query';
import { ApiError } from './api/client';

export function createQueryClient() {
  const queryClient: QueryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 10_000,
        // Don't retry client errors such as 404.
        retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
      },
    },
    // Data is small and highly interrelated (a stay edit can make bills stale), so every
    // successful change simply refreshes everything that is on screen.
    mutationCache: new MutationCache({
      onSuccess: () => queryClient.invalidateQueries(),
    }),
  });
  return queryClient;
}
