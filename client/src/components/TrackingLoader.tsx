/**
 * Busca os IDs de pixel no servidor e inicializa as tags uma única vez.
 * Fica montado no App para valer em todas as rotas da loja.
 */
import { useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { initTracking } from "@/lib/tracking";

export default function TrackingLoader() {
  const { data } = trpc.store.tracking.useQuery(undefined, {
    staleTime: 10 * 60 * 1000,
    retry: false,
  });

  useEffect(() => {
    if (!data) return;
    initTracking(data);
  }, [data]);

  return null;
}
