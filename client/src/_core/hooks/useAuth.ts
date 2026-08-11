import { trpc } from "@/lib/trpc";

export function useAuth() {
  const { data: user, isLoading, error, refetch } = trpc.auth.me.useQuery();
  return { user, isLoading, error, refetch };
}
