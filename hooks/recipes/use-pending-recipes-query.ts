"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useCallback } from "react";

import { useTRPC } from "@/app/providers/trpc-provider";
import { createClientLogger } from "@/lib/logger";

const log = createClientLogger("pending-recipes-query");

// Key for storing pending recipe IDs in the query cache (shared state)
// Exported so other hooks can read from the same key
export const PENDING_RECIPES_KEY = ["recipes", "pending"];

/**
 * Hook that manages pending recipe IDs state.
 *
 * - Hydrates from server on mount (fetches pending import jobs)
 * - Provides add/remove helpers for real-time updates
 * - Returns the current set of pending recipe IDs
 *
 * Call this from useRecipesSubscription to hydrate on app load.
 * Use the returned helpers in subscription handlers.
 */
export function usePendingRecipesQuery() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  // Fetch pending import jobs from server
  const {
    data: serverData,
    isLoading,
    error,
  } = useQuery({
    ...trpc.recipes.getPending.queryOptions(),
    staleTime: 30_000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });

  // Local state query - this is the source of truth for the UI
  // Uses a stable queryFn that returns empty array as initial value
  const { data: localData } = useQuery({
    queryKey: PENDING_RECIPES_KEY,
    queryFn: () => [] as string[],
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // Hydrate local state from server data
  useEffect(() => {
    if (!serverData || serverData.length === 0) return;

    const pendingIds = serverData.map((job) => job.recipeId);

    log.debug({ count: pendingIds.length }, "Hydrating pending recipes from server");

    queryClient.setQueryData<string[]>(PENDING_RECIPES_KEY, (prev) => {
      const existing = prev ?? [];
      const merged = [...new Set([...existing, ...pendingIds])];

      return merged;
    });
  }, [serverData, queryClient]);

  const pendingRecipeIds = useMemo(() => new Set(localData ?? []), [localData]);

  const addPendingRecipe = useCallback(
    (recipeId: string) => {
      queryClient.setQueryData<string[]>(PENDING_RECIPES_KEY, (prev) => {
        const arr = prev ?? [];

        if (arr.includes(recipeId)) return arr;

        return [...arr, recipeId];
      });
    },
    [queryClient]
  );

  const removePendingRecipe = useCallback(
    (recipeId: string) => {
      queryClient.setQueryData<string[]>(PENDING_RECIPES_KEY, (prev) => {
        const arr = prev ?? [];

        return arr.filter((id) => id !== recipeId);
      });
    },
    [queryClient]
  );

  return {
    pendingRecipeIds,
    addPendingRecipe,
    removePendingRecipe,
    isLoading,
    error,
  };
}
