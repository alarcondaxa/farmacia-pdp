import { trpc } from "@/lib/trpc";
import { useCallback, useEffect } from "react";

const CLICKABLE_SELECTOR = [
  "button",
  "a[href]",
  "[role='button']",
  "summary",
  "input[type='button']",
  "input[type='submit']",
  "input[type='checkbox']",
  "input[type='radio']",
  "select",
  "[data-track-click]",
].join(", ");

const MAX_LABEL_LENGTH = 90;

function normalizeText(value?: string | null) {
  return (value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_LABEL_LENGTH);
}

function slugify(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  return normalized || "acao-sem-rotulo";
}

function getElementLabel(element: HTMLElement) {
  const explicitLabel = element.dataset.trackLabel;
  const ariaLabel = element.getAttribute("aria-label");
  const title = element.getAttribute("title");
  const placeholder = element.getAttribute("placeholder");
  const alt = element.getAttribute("alt");
  const text = element.innerText || element.textContent;

  return normalizeText(explicitLabel || ariaLabel || title || text || placeholder || alt || element.id);
}

function getElementId(element: HTMLElement, label: string) {
  if (element.dataset.trackId) return element.dataset.trackId;
  if (element.id) return `${element.tagName.toLowerCase()}#${element.id}`;

  const tag = element.tagName.toLowerCase();
  const href = element instanceof HTMLAnchorElement ? element.getAttribute("href") : null;
  if (href && href !== "#") {
    try {
      const destination = new URL(href, window.location.origin);
      return `link:${destination.pathname || "/"}`;
    } catch {
      return `link:${slugify(label)}`;
    }
  }

  const input = element as HTMLInputElement;
  const inputType = input.type && tag === "input" ? `-${input.type}` : "";
  return `${tag}${inputType}:${slugify(label)}`;
}

/**
 * Captura de cliques para toda a loja. É montada uma única vez na raiz do app
 * e encontra o elemento acionável mais próximo do clique, inclusive quando o
 * visitante clica em um ícone dentro de um botão.
 */
export function GlobalClickTracking() {
  const trackClickMutation = trpc.store.trackClick.useMutation();

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const source = event.target;
      if (!(source instanceof Element)) return;

      const clickable = source.closest(CLICKABLE_SELECTOR);
      if (!(clickable instanceof HTMLElement)) return;
      if (clickable.closest("[data-click-tracking-ignore]")) return;
      if (clickable.hasAttribute("disabled") || clickable.getAttribute("aria-disabled") === "true") return;

      const label = getElementLabel(clickable);
      const elementId = getElementId(clickable, label);

      trackClickMutation.mutate({
        elementId,
        elementText: label || undefined,
        // Mantém o agrupamento por rota; parâmetros de URL não fragmentam o relatório.
        pageUrl: window.location.pathname,
      });
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [trackClickMutation]);

  return null;
}

/**
 * Compatibilidade com os componentes que já chamavam trackClick manualmente.
 * A captura global acima registra todas as ações, inclusive essas, evitando
 * eventos duplicados no painel administrativo.
 */
export function useClickTracking() {
  const trackClick = useCallback((_elementId: string, _elementText?: string) => undefined, []);
  return { trackClick };
}
