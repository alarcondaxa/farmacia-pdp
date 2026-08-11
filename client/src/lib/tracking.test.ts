/**
 * Módulo de rastreamento: mapeamento de eventos, valores enviados e o
 * interruptor do painel. Os provedores são substituídos por espiões, então os
 * testes verificam exatamente o que sairia para Meta e Google.
 *
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  initTracking,
  isTrackingReady,
  trackEvent,
  trackPurchase,
  type TrackedItem,
  type TrackingConfig,
} from "./tracking";

const baseConfig: TrackingConfig = {
  enabled: true,
  metaPixelId: "1234567890123456",
  ga4MeasurementId: "G-ABC123DEF4",
  googleAdsId: "AW-123456789",
  googleAdsPurchaseLabel: "AbC-D_efGh",
  gtmId: "",
};

const items: TrackedItem[] = [
  { id: "1272202-15mg", name: "T.G 15mg", price: 826.5, quantity: 2, variant: "15mg" },
  { id: "1272202-5mg", name: "T.G 5mg", price: 484.5, quantity: 1, variant: "5mg" },
];

let fbqCalls: unknown[][] = [];
let gtagCalls: unknown[][] = [];

beforeEach(() => {
  fbqCalls = [];
  gtagCalls = [];
  // Substitui os SDKs: initTracking respeita objetos já presentes na window.
  (window as unknown as { fbq: unknown }).fbq = (...args: unknown[]) => {
    fbqCalls.push(args);
  };
  (window as unknown as { gtag: unknown }).gtag = (...args: unknown[]) => {
    gtagCalls.push(args);
  };
  vi.spyOn(document.head, "appendChild").mockImplementation(
    (node: never) => node,
  );
});

/**
 * Eventos capturados de um provedor, ignorando init/config e o PageView que o
 * Meta Pixel dispara automaticamente na inicialização.
 */
function metaEvents() {
  return fbqCalls.filter(call => call[0] === "track" && call[1] !== "PageView");
}
function gtagEvents() {
  return gtagCalls.filter(call => call[0] === "event");
}

describe("tracking", () => {
  it("não dispara nada quando o rastreamento está desligado", () => {
    initTracking({ ...baseConfig, enabled: false });
    expect(isTrackingReady()).toBe(false);

    trackEvent("view_item", items);
    trackPurchase({
      reference: "TG-000001",
      value: 2137.5,
      items,
      paymentMethod: "Pix",
    });

    expect(metaEvents()).toHaveLength(0);
    expect(gtagEvents()).toHaveLength(0);
  });

  it("mapeia os eventos do funil para os nomes de cada provedor", () => {
    initTracking(baseConfig);

    trackEvent("view_item", items);
    trackEvent("add_to_cart", items);
    trackEvent("begin_checkout", items);
    trackEvent("add_payment_info", items);

    const metaNames = metaEvents().map(call => call[1]);
    expect(metaNames).toEqual([
      "ViewContent",
      "AddToCart",
      "InitiateCheckout",
      "AddPaymentInfo",
    ]);

    const gaNames = gtagEvents().map(call => call[1]);
    expect(gaNames).toEqual([
      "view_item",
      "add_to_cart",
      "begin_checkout",
      "add_payment_info",
    ]);
  });

  it("pedido pendente usa InitiateCheckout, não Purchase", () => {
    initTracking(baseConfig);
    trackEvent("checkout_started", items, { payment_type: "Pix" });

    expect(metaEvents().map(c => c[1])).toEqual(["InitiateCheckout"]);
    // Nenhuma conversão de compra deve sair antes da confirmação.
    expect(metaEvents().map(c => c[1])).not.toContain("Purchase");
    expect(gtagEvents().map(c => c[1])).not.toContain("purchase");
  });

  it("soma o valor dos itens em centavos, sem erro de ponto flutuante", () => {
    initTracking(baseConfig);
    trackEvent("add_to_cart", items);

    const payload = metaEvents()[0]?.[2] as { value: number; currency: string };
    // 826,50 x 2 + 484,50 = 2.137,50
    expect(payload.value).toBe(2137.5);
    expect(payload.currency).toBe("BRL");

    const gaPayload = gtagEvents()[0]?.[2] as {
      value: number;
      items: { item_id: string; quantity: number }[];
    };
    expect(gaPayload.value).toBe(2137.5);
    expect(gaPayload.items).toHaveLength(2);
    expect(gaPayload.items[0]?.item_id).toBe("1272202-15mg");
  });

  it("compra envia transaction_id nos três destinos", () => {
    initTracking(baseConfig);
    trackPurchase({
      reference: "TG-000123",
      value: 2137.5,
      items,
      paymentMethod: "Pix",
    });

    // Meta: eventID permite desduplicar recargas da página.
    const meta = metaEvents()[0];
    expect(meta?.[1]).toBe("Purchase");
    expect(meta?.[3]).toEqual({ eventID: "TG-000123" });

    const events = gtagEvents();
    const purchase = events.find(c => c[1] === "purchase")?.[2] as {
      transaction_id: string;
      value: number;
    };
    expect(purchase.transaction_id).toBe("TG-000123");
    expect(purchase.value).toBe(2137.5);

    // Google Ads: par ID/rótulo em send_to.
    const conversion = events.find(c => c[1] === "conversion")?.[2] as {
      send_to: string;
    };
    expect(conversion.send_to).toBe("AW-123456789/AbC-D_efGh");
  });

  it("sem rótulo do Google Ads, envia a conversão para a conta", () => {
    initTracking({ ...baseConfig, googleAdsPurchaseLabel: "" });
    trackPurchase({
      reference: "TG-000124",
      value: 100,
      items: [items[0]!],
      paymentMethod: "Pix",
    });

    const conversion = gtagEvents().find(c => c[1] === "conversion")?.[2] as {
      send_to: string;
    };
    expect(conversion.send_to).toBe("AW-123456789");
  });

  it("usa apenas o provedor configurado", () => {
    initTracking({
      ...baseConfig,
      ga4MeasurementId: "",
      googleAdsId: "",
      googleAdsPurchaseLabel: "",
    });
    trackEvent("view_item", items);

    expect(metaEvents()).toHaveLength(1);
    expect(gtagEvents()).toHaveLength(0);
  });
});
