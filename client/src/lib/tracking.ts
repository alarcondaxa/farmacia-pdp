/**
 * Rastreamento de conversões (Meta Pixel + Google gtag/GTM).
 *
 * Os IDs vêm do painel admin (tabela `settings`), então as tags só são
 * injetadas quando o dono da loja preenche os campos e mantém o rastreamento
 * ativo. Nada é hardcoded aqui.
 *
 * Eventos padronizados nos dois lados:
 *  view_item      → Meta ViewContent      · GA4 view_item
 *  add_to_cart    → Meta AddToCart        · GA4 add_to_cart
 *  begin_checkout → Meta InitiateCheckout · GA4 begin_checkout
 *  add_payment_info → Meta AddPaymentInfo · GA4 add_payment_info
 *  purchase       → Meta Purchase         · GA4 purchase + Google Ads conversion
 */

export type TrackingConfig = {
  enabled: boolean;
  metaPixelId: string;
  ga4MeasurementId: string;
  googleAdsId: string;
  googleAdsPurchaseLabel: string;
  gtmId: string;
};

export type TrackedItem = {
  /** Identificador do item no catálogo (usamos SKU + dosagem). */
  id: string;
  name: string;
  price: number;
  quantity: number;
  variant?: string;
};

declare global {
  interface Window {
    fbq?: ((...args: unknown[]) => void) & { callMethod?: unknown; queue?: unknown[] };
    _fbq?: unknown;
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

const CURRENCY = "BRL";

/** Evita injetar o mesmo script duas vezes em navegações SPA. */
const loaded = new Set<string>();

function injectScript(id: string, src: string, async = true) {
  if (loaded.has(id) || document.getElementById(id)) return;
  const script = document.createElement("script");
  script.id = id;
  script.async = async;
  script.src = src;
  document.head.appendChild(script);
  loaded.add(id);
}

/** Base do Meta Pixel (equivalente ao snippet oficial, sem o <noscript>). */
function initMetaPixel(pixelId: string) {
  if (loaded.has("meta-pixel")) return;

  const fbq: Window["fbq"] = function (...args: unknown[]) {
    const self = window.fbq!;
    if (self.callMethod) {
      (self.callMethod as (...a: unknown[]) => void).apply(self, args);
    } else {
      (self.queue as unknown[]).push(args);
    }
  } as NonNullable<Window["fbq"]>;

  if (!window.fbq) {
    window.fbq = fbq;
    window._fbq = fbq;
    fbq.queue = [];
  }

  injectScript("meta-pixel", "https://connect.facebook.net/en_US/fbevents.js");
  loaded.add("meta-pixel");

  window.fbq?.("init", pixelId);
  window.fbq?.("track", "PageView");
}

/** Base do gtag.js, compartilhada por GA4 e Google Ads. */
function initGtag(ids: string[]) {
  const primary = ids[0];
  if (!primary) return;

  window.dataLayer = window.dataLayer || [];
  if (!window.gtag) {
    window.gtag = function (...args: unknown[]) {
      window.dataLayer!.push(args);
    };
    window.gtag("js", new Date());
  }

  injectScript(
    "gtag-base",
    `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(primary)}`,
  );

  for (const id of ids) {
    if (loaded.has(`gtag-config-${id}`)) continue;
    window.gtag?.("config", id);
    loaded.add(`gtag-config-${id}`);
  }
}

/** Google Tag Manager (opcional, para quem gerencia tags de fora). */
function initGtm(gtmId: string) {
  if (loaded.has("gtm")) return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });
  injectScript(
    "gtm",
    `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(gtmId)}`,
  );
  loaded.add("gtm");
}

let current: TrackingConfig | null = null;

/** Ativa as tags configuradas. Chamado uma vez, quando as settings chegam. */
export function initTracking(config: TrackingConfig) {
  if (typeof window === "undefined") return;
  current = config;
  if (!config.enabled) return;

  if (config.metaPixelId) initMetaPixel(config.metaPixelId);

  const googleIds = [config.ga4MeasurementId, config.googleAdsId].filter(
    Boolean,
  );
  if (googleIds.length) initGtag(googleIds);

  if (config.gtmId) initGtm(config.gtmId);
}

export function isTrackingReady() {
  return Boolean(current?.enabled);
}

function metaContents(items: TrackedItem[]) {
  return items.map(item => ({
    id: item.id,
    quantity: item.quantity,
    item_price: item.price,
  }));
}

function ga4Items(items: TrackedItem[]) {
  return items.map(item => ({
    item_id: item.id,
    item_name: item.name,
    item_variant: item.variant,
    price: item.price,
    quantity: item.quantity,
  }));
}

function sumValue(items: TrackedItem[]) {
  const cents = items.reduce(
    (total, item) => total + Math.round(item.price * 100) * item.quantity,
    0,
  );
  return cents / 100;
}

type FunnelEvent =
  | "view_item"
  | "add_to_cart"
  | "begin_checkout"
  | "add_payment_info"
  | "checkout_started";

const META_EVENT: Record<FunnelEvent, string> = {
  view_item: "ViewContent",
  add_to_cart: "AddToCart",
  begin_checkout: "InitiateCheckout",
  add_payment_info: "AddPaymentInfo",
  // Pedido gerado, pagamento ainda não confirmado. Reaproveita
  // InitiateCheckout para não contar receita antes do dinheiro entrar.
  checkout_started: "InitiateCheckout",
};

/** Dispara um evento do funil nos dois provedores, quando configurados. */
export function trackEvent(
  event: FunnelEvent,
  items: TrackedItem[],
  extra: Record<string, unknown> = {},
) {
  if (!current?.enabled || typeof window === "undefined") return;

  const value = sumValue(items);

  if (current.metaPixelId) {
    window.fbq?.("track", META_EVENT[event], {
      content_type: "product",
      contents: metaContents(items),
      content_ids: items.map(i => i.id),
      value,
      currency: CURRENCY,
      ...extra,
    });
  }

  if (current.ga4MeasurementId || current.googleAdsId) {
    window.gtag?.("event", event, {
      currency: CURRENCY,
      value,
      items: ga4Items(items),
      ...extra,
    });
  }
}

/**
 * Conversão de compra. `reference` vira o id da transação, o que permite ao
 * Meta e ao Google desduplicarem recargas da página de confirmação.
 */
export function trackPurchase(params: {
  reference: string;
  value: number;
  items: TrackedItem[];
  paymentMethod: string;
}) {
  if (!current?.enabled || typeof window === "undefined") return;

  const { reference, value, items, paymentMethod } = params;

  if (current.metaPixelId) {
    window.fbq?.(
      "track",
      "Purchase",
      {
        content_type: "product",
        contents: metaContents(items),
        content_ids: items.map(i => i.id),
        value,
        currency: CURRENCY,
        payment_method: paymentMethod,
      },
      { eventID: reference },
    );
  }

  if (current.ga4MeasurementId) {
    window.gtag?.("event", "purchase", {
      transaction_id: reference,
      value,
      currency: CURRENCY,
      payment_type: paymentMethod,
      items: ga4Items(items),
    });
  }

  // Google Ads exige o par ID/rótulo em `send_to`.
  if (current.googleAdsId && current.googleAdsPurchaseLabel) {
    window.gtag?.("event", "conversion", {
      send_to: `${current.googleAdsId}/${current.googleAdsPurchaseLabel}`,
      transaction_id: reference,
      value,
      currency: CURRENCY,
    });
  } else if (current.googleAdsId) {
    // Sem rótulo ainda é possível registrar a conversão principal da conta.
    window.gtag?.("event", "conversion", {
      send_to: current.googleAdsId,
      transaction_id: reference,
      value,
      currency: CURRENCY,
    });
  }
}
