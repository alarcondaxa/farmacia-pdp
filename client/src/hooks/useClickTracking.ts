import { trpc } from "@/lib/trpc";
import { useCallback } from "react";

export function useClickTracking() {
  const trackClickMutation = trpc.store.trackClick.useMutation();

  const trackClick = useCallback((elementId: string, elementText?: string) => {
    trackClickMutation.mutate({
      elementId,
      elementText,
      pageUrl: window.location.href,
    });
  }, [trackClickMutation]);

  return { trackClick };
}
