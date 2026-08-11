/**
 * Rotas de rastreamento: a rota pública só pode expor IDs públicos (nunca o
 * token da Conversions API) e precisa respeitar o interruptor do painel.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const settingsStore: Record<string, string> = {};

vi.mock("./db", () => ({
  getSettings: vi.fn(async () => ({ ...settingsStore })),
  saveSettings: vi.fn(async (values: Record<string, string>) => {
    Object.assign(settingsStore, values);
  }),
  listOrders: vi.fn(async () => []),
  listStock: vi.fn(async () => []),
  countOrdersByIp: vi.fn(async () => 0),
  createOrder: vi.fn(),
  decrementStock: vi.fn(),
  deleteOrder: vi.fn(),
  getNextOrderSequence: vi.fn(async () => 1),
  getOrderById: vi.fn(),
  getOrderByReference: vi.fn(),
  claimOrderPayment: vi.fn(),
  restoreStock: vi.fn(),
  setOrderPixPayload: vi.fn(),
  updateOrderStatus: vi.fn(),
  upsertStock: vi.fn(),
}));

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function publicCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {}, ip: "1.2.3.4" } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  } as TrpcContext;
}

function adminCtx(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "admin",
      email: "admin@example.com",
      name: "Admin",
      loginMethod: "manus",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  } as TrpcContext;
}

const validSettings = {
  pixKey: "loja@tg.com.br",
  pixKeyType: "email" as const,
  pixReceiverName: "Loja TG",
  pixCity: "Sao Paulo",
  storeWhatsapp: "",
  maxOrdersPerIp: 2,
  ipWindowHours: 24,
  trackingEnabled: true,
  metaPixelId: "1234567890123456",
  metaCapiToken: "EAAG-token-secreto",
  ga4MeasurementId: "G-ABC123DEF4",
  googleAdsId: "AW-123456789",
  googleAdsPurchaseLabel: "AbC-D_efGh",
  gtmId: "GTM-ABC1234",
};

describe("store.tracking", () => {
  beforeEach(() => {
    for (const key of Object.keys(settingsStore)) delete settingsStore[key];
  });

  it("salva os IDs de pixel e devolve para o painel", async () => {
    const admin = appRouter.createCaller(adminCtx());
    await admin.store.admin.saveSettings(validSettings);

    const saved = await admin.store.admin.settings();
    expect(saved.metaPixelId).toBe("1234567890123456");
    expect(saved.ga4MeasurementId).toBe("G-ABC123DEF4");
    expect(saved.googleAdsId).toBe("AW-123456789");
    expect(saved.gtmId).toBe("GTM-ABC1234");
    expect(saved.metaCapiToken).toBe("EAAG-token-secreto");
    expect(saved.trackingEnabled).toBe(true);
  });

  it("expõe apenas IDs públicos na rota do navegador", async () => {
    const admin = appRouter.createCaller(adminCtx());
    await admin.store.admin.saveSettings(validSettings);

    const config = await appRouter.createCaller(publicCtx()).store.tracking();
    expect(config.enabled).toBe(true);
    expect(config.metaPixelId).toBe("1234567890123456");
    expect(config.googleAdsPurchaseLabel).toBe("AbC-D_efGh");
    // O token da CAPI não pode chegar ao navegador.
    expect(Object.keys(config)).not.toContain("metaCapiToken");
    expect(JSON.stringify(config)).not.toContain("EAAG-token-secreto");
  });

  it("zera os IDs quando o rastreamento está desligado", async () => {
    const admin = appRouter.createCaller(adminCtx());
    await admin.store.admin.saveSettings({
      ...validSettings,
      trackingEnabled: false,
    });

    const config = await appRouter.createCaller(publicCtx()).store.tracking();
    expect(config.enabled).toBe(false);
    expect(config.metaPixelId).toBe("");
    expect(config.ga4MeasurementId).toBe("");
    expect(config.googleAdsId).toBe("");
  });

  it("recusa IDs em formato inválido", async () => {
    const admin = appRouter.createCaller(adminCtx());

    await expect(
      admin.store.admin.saveSettings({ ...validSettings, metaPixelId: "123" }),
    ).rejects.toThrow();

    await expect(
      admin.store.admin.saveSettings({
        ...validSettings,
        ga4MeasurementId: "UA-123456",
      }),
    ).rejects.toThrow();

    await expect(
      admin.store.admin.saveSettings({
        ...validSettings,
        googleAdsId: "123456789",
      }),
    ).rejects.toThrow();
  });

  it("aceita campos vazios (loja sem rastreamento configurado)", async () => {
    const admin = appRouter.createCaller(adminCtx());
    await admin.store.admin.saveSettings({
      ...validSettings,
      metaPixelId: "",
      ga4MeasurementId: "",
      googleAdsId: "",
      gtmId: "",
      googleAdsPurchaseLabel: "",
      metaCapiToken: "",
    });

    const config = await appRouter.createCaller(publicCtx()).store.tracking();
    expect(config.enabled).toBe(true);
    expect(config.metaPixelId).toBe("");
  });

  it("bloqueia visitante comum na configuração", async () => {
    const guest = appRouter.createCaller(publicCtx());
    await expect(
      guest.store.admin.saveSettings(validSettings),
    ).rejects.toThrow();
  });
});
