import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

/**
 * Testes das rotas da loja com o módulo de banco mockado, para validar as
 * regras (total calculado no servidor, exigência da chave Pix, restrição do
 * painel admin) sem depender de um banco real.
 */

const state = {
  settings: {} as Record<string, string>,
  inserted: [] as Record<string, unknown>[],
  notifications: [] as { title: string; content: string }[],
  claims: [] as string[],
  stock: [] as { dosage: string; available: number; lot: number }[],
  /** Pedidos já contados por IP, simulando o histórico do banco. */
  ordersByIp: {} as Record<string, number>,
  /** Conversões enviadas ao Meta, para checar a trava de duplicidade. */
  capiSent: [] as number[],
  /** Cobranças registradas como enviadas pelo WhatsApp. */
  chargesSent: [] as number[],
  /** Chamadas efetivas ao módulo da Conversions API. */
  capiCalls: [] as { reference: string; total: number }[],
  /** Quando true, o envio ao Meta falha (simula token inválido/rede). */
  capiShouldFail: false,
};

vi.mock("./db", () => ({
  getSettings: async () => state.settings,
  saveSettings: async (values: Record<string, string>) => {
    Object.assign(state.settings, values);
  },
  getNextOrderSequence: async () => state.inserted.length + 1,
  createOrder: async (order: Record<string, unknown>) => {
    state.inserted.push(order);
    return { ...order, id: state.inserted.length, installments: order.installments };
  },
  listOrders: async () =>
    state.inserted.map((order, index) => ({ ...order, id: index + 1 })),
  getOrderByReference: async (reference: string) =>
    state.inserted.find(order => order.reference === reference),
  getOrderById: async (id: number) => {
    const order = state.inserted[id - 1];
    return order ? { ...order, id } : undefined;
  },
  updateOrderStatus: async () => undefined,
  claimOrderPayment: async (reference: string) => {
    state.claims.push(reference);
    const order = state.inserted.find(o => o.reference === reference);
    if (order) order.status = "awaiting_confirmation";
  },
  deleteOrder: async () => undefined,
  setOrderPixPayload: async (reference: string, pixPayload: string) => {
    const order = state.inserted.find(o => o.reference === reference);
    if (order) {
      order.pixPayload = pixPayload;
      order.paymentMethod = "pix";
      order.status = "pending";
    }
  },
  listStock: async () => state.stock,
  upsertStock: async (dosage: string, available: number, lot: number) => {
    const found = state.stock.find(row => row.dosage === dosage);
    if (found) Object.assign(found, { available, lot });
    else state.stock.push({ dosage, available, lot });
  },
  decrementStock: async (dosage: string, quantity: number) => {
    const found = state.stock.find(row => row.dosage === dosage);
    if (!found || found.available < quantity) return false;
    found.available -= quantity;
    return true;
  },
  restoreStock: async (dosage: string, quantity: number) => {
    const found = state.stock.find(row => row.dosage === dosage);
    if (found) found.available += quantity;
  },
  countOrdersByIp: async (clientIp: string) => state.ordersByIp[clientIp] ?? 0,
  markCapiSent: async (id: number) => {
    if (state.capiSent.includes(id)) return false;
    state.capiSent.push(id);
    return true;
  },
  clearCapiSent: async (id: number) => {
    state.capiSent = state.capiSent.filter(item => item !== id);
  },
  markChargeSent: async (id: number) => {
    state.chargesSent.push(id);
  },
}));

vi.mock("./_core/notification", () => ({
  notifyOwner: async (payload: { title: string; content: string }) => {
    state.notifications.push(payload);
    return true;
  },
}));

vi.mock("./metaCapi", () => ({
  sendPurchaseToMeta: async (order: { reference: string; total: number }) => {
    state.capiCalls.push({ reference: order.reference, total: order.total });
    return state.capiShouldFail
      ? { sent: false as const, reason: "token inválido" }
      : { sent: true as const, eventsReceived: 1 };
  },
}));

const { appRouter } = await import("./routers");

function context(role?: "admin" | "user", ip = "200.1.2.3"): TrpcContext {
  return {
    user: role
      ? ({
          id: 1,
          openId: "owner",
          email: "dono@loja.com",
          name: "Dono",
          loginMethod: "manus",
          role,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastSignedIn: new Date(),
        } as NonNullable<TrpcContext["user"]>)
      : null,
    req: {
      protocol: "https",
      headers: { "x-forwarded-for": ip },
    } as unknown as TrpcContext["req"],
    res: { clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
}

const baseOrder = {
  customerName: "Maria Souza",
  email: "maria@example.com",
  cpf: "123.456.789-00",
  phone: "(11) 98888-7777",
  cep: "01310-100",
  address: "Avenida Paulista",
  number: "1000",
  district: "Bela Vista",
  city: "São Paulo",
  state: "SP",
  items: [
    {
      sku: "1272202-15mg",
      name: "T.G 15mg",
      dosage: "15mg",
      quantity: 2,
      unitPrice: 870,
      listPrice: 1450,
    },
  ],
};

beforeEach(() => {
  state.settings = {};
  state.inserted = [];
  state.notifications = [];
  state.claims = [];
  state.stock = [
    { dosage: "15mg", available: 5, lot: 10 },
    { dosage: "10mg", available: 1, lot: 14 },
    { dosage: "5mg", available: 0, lot: 18 },
  ];
  state.ordersByIp = {};
  state.capiSent = [];
  state.chargesSent = [];
  state.capiCalls = [];
  state.capiShouldFail = false;
});

describe("store.createOrder", () => {
  it("recusa Pix quando a chave não está configurada", async () => {
    const caller = appRouter.createCaller(context());
    await expect(
      caller.store.createOrder({
        ...baseOrder,
        paymentMethod: "pix",
        installments: 1,
      }),
    ).rejects.toThrow(/chave Pix/i);
  });

  it("gera Pix copia-e-cola e calcula o total no servidor", async () => {
    state.settings = {
      pixKey: "loja@tg.com.br",
      pixReceiverName: "Loja TG",
      pixCity: "Sao Paulo",
    };

    const caller = appRouter.createCaller(context());
    const result = await caller.store.createOrder({
      ...baseOrder,
      paymentMethod: "pix",
      installments: 1,
    });

    expect(result.total).toBe(1740);
    expect(result.reference).toBe("TG-000001");
    expect(result.pixPayload).toContain("loja@tg.com.br");
    expect(result.pixPayload).toContain("54071740.00");
    expect(state.inserted).toHaveLength(1);
    expect(state.inserted[0]).toMatchObject({
      customerName: "Maria Souza",
      city: "São Paulo",
      total: "1740.00",
    });
  });

  it("notifica o dono da loja com os dados do pedido", async () => {
    const caller = appRouter.createCaller(context());
    await caller.store.createOrder({
      ...baseOrder,
      paymentMethod: "card",
      installments: 2,
      cardBrand: "Visa",
      cardLast4: "1111",
      cardHolder: "Maria Souza",
    });

    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0].title).toContain("TG-000001");
    expect(state.notifications[0].content).toContain("Maria Souza");
    expect(state.notifications[0].content).toContain("Avenida Paulista");
    expect(state.notifications[0].content).toContain("Visa ****1111 em 2x");
  });

  it("aceita cartão sem chave Pix e limita o parcelamento a 3x", async () => {
    const caller = appRouter.createCaller(context());
    const result = await caller.store.createOrder({
      ...baseOrder,
      paymentMethod: "card",
      installments: 3,
    });

    expect(result.pixPayload).toBeNull();
    expect(result.installments).toBe(3);

    await expect(
      caller.store.createOrder({
        ...baseOrder,
        paymentMethod: "card",
        installments: 4,
      }),
    ).rejects.toThrow();
  });

  it("grava apenas bandeira, 4 últimos e titular do cartão", async () => {
    const caller = appRouter.createCaller(context());
    await caller.store.createOrder({
      ...baseOrder,
      paymentMethod: "card",
      installments: 3,
      cardBrand: "Visa",
      cardLast4: "1111",
      cardHolder: "Maria Souza",
    });

    const saved = state.inserted[0];
    expect(saved).toMatchObject({
      cardBrand: "Visa",
      cardLast4: "1111",
      cardHolder: "Maria Souza",
    });

    // Nenhum campo do pedido pode conter PAN completo, validade ou CVV.
    const serialized = JSON.stringify(saved);
    expect(serialized).not.toContain("4111111111111111");
    expect(Object.keys(saved)).not.toContain("cardNumber");
    expect(Object.keys(saved)).not.toContain("cvv");
    expect(Object.keys(saved)).not.toContain("expiry");
  });

  it("recusa cardLast4 fora do formato de 4 dígitos", async () => {
    const caller = appRouter.createCaller(context());
    await expect(
      caller.store.createOrder({
        ...baseOrder,
        paymentMethod: "card",
        installments: 1,
        cardLast4: "4111111111111111",
      }),
    ).rejects.toThrow();
  });

  it("ignora dados de cartão quando o pagamento é Pix", async () => {
    state.settings = {
      pixKey: "loja@tg.com.br",
      pixReceiverName: "Loja TG",
      pixCity: "Sao Paulo",
    };

    const caller = appRouter.createCaller(context());
    await caller.store.createOrder({
      ...baseOrder,
      paymentMethod: "pix",
      installments: 1,
      cardBrand: "Visa",
      cardLast4: "1111",
      cardHolder: "Maria Souza",
    });

    expect(state.inserted[0]).toMatchObject({
      cardBrand: null,
      cardLast4: null,
      cardHolder: null,
    });
  });

  it("marca o pedido no cartão como recusado e devolve declined", async () => {
    const caller = appRouter.createCaller(context());
    const result = await caller.store.createOrder({
      ...baseOrder,
      paymentMethod: "card",
      installments: 3,
      cardBrand: "Visa",
      cardLast4: "1111",
      cardHolder: "Maria Souza",
    });

    expect(result.declined).toBe(true);
    expect(state.inserted[0]).toMatchObject({ status: "card_declined" });
    // Mesmo recusado, todos os dados do cliente ficam salvos.
    expect(state.inserted[0]).toMatchObject({
      customerName: "Maria Souza",
      cpf: "123.456.789-00",
      address: "Avenida Paulista",
      cardLast4: "1111",
    });
    expect(state.notifications[0].title).toContain("Cartão recusado");
  });

  it("Pix não é marcado como recusado", async () => {
    state.settings = {
      pixKey: "loja@tg.com.br",
      pixReceiverName: "Loja TG",
      pixCity: "Sao Paulo",
    };

    const caller = appRouter.createCaller(context());
    const result = await caller.store.createOrder({
      ...baseOrder,
      paymentMethod: "pix",
      installments: 1,
    });

    expect(result.declined).toBe(false);
    expect(state.inserted[0]).toMatchObject({ status: "pending" });
  });
});

describe("store.switchToPix", () => {
  it("gera o Pix de um pedido recusado no cartão sem redigitar dados", async () => {
    state.settings = {
      pixKey: "loja@tg.com.br",
      pixReceiverName: "Loja TG",
      pixCity: "Sao Paulo",
    };

    const caller = appRouter.createCaller(context());
    const order = await caller.store.createOrder({
      ...baseOrder,
      paymentMethod: "card",
      installments: 3,
    });

    const result = await caller.store.switchToPix({
      reference: order.reference,
    });

    expect(result.pixPayload).toContain("loja@tg.com.br");
    expect(result.pixPayload).toContain("54071740.00");
    expect(state.inserted[0]).toMatchObject({
      paymentMethod: "pix",
      status: "pending",
    });
  });

  it("exige chave Pix configurada e recusa referência inexistente", async () => {
    const caller = appRouter.createCaller(context());
    const order = await caller.store.createOrder({
      ...baseOrder,
      paymentMethod: "card",
      installments: 1,
    });

    await expect(
      caller.store.switchToPix({ reference: order.reference }),
    ).rejects.toThrow(/chave Pix/i);

    await expect(
      caller.store.switchToPix({ reference: "TG-999999" }),
    ).rejects.toThrow(/não encontrado/i);
  });
});

describe("store.createOrder — estoque e limite por IP", () => {
  it("dá baixa no estoque da dosagem comprada", async () => {
    const caller = appRouter.createCaller(context());
    await caller.store.createOrder({
      ...baseOrder,
      paymentMethod: "card",
      installments: 1,
    });

    // baseOrder pede 2 unidades de 15mg, que começa com 5 disponíveis.
    expect(state.stock.find(s => s.dosage === "15mg")?.available).toBe(3);
  });

  it("recusa quando a dosagem está esgotada", async () => {
    const caller = appRouter.createCaller(context());
    await expect(
      caller.store.createOrder({
        ...baseOrder,
        paymentMethod: "card",
        installments: 1,
        items: [{ ...baseOrder.items[0], dosage: "5mg", quantity: 1 }],
      }),
    ).rejects.toThrow(/esgotada/i);

    expect(state.inserted).toHaveLength(0);
  });

  it("recusa quantidade acima do disponível e preserva o estoque", async () => {
    const caller = appRouter.createCaller(context());
    await expect(
      caller.store.createOrder({
        ...baseOrder,
        paymentMethod: "card",
        installments: 1,
        items: [{ ...baseOrder.items[0], dosage: "10mg", quantity: 3 }],
      }),
    ).rejects.toThrow(/Restam apenas 1/i);

    expect(state.stock.find(s => s.dosage === "10mg")?.available).toBe(1);
  });

  it("devolve o estoque reservado quando o Pix não está configurado", async () => {
    const caller = appRouter.createCaller(context());
    await expect(
      caller.store.createOrder({
        ...baseOrder,
        paymentMethod: "pix",
        installments: 1,
      }),
    ).rejects.toThrow(/chave Pix/i);

    expect(state.stock.find(s => s.dosage === "15mg")?.available).toBe(5);
  });

  it("bloqueia o IP que já atingiu o limite de pedidos", async () => {
    state.settings = { maxOrdersPerIp: "2", ipWindowHours: "24" };
    state.ordersByIp["200.1.2.3"] = 2;

    const caller = appRouter.createCaller(context(undefined, "200.1.2.3"));
    await expect(
      caller.store.createOrder({
        ...baseOrder,
        paymentMethod: "card",
        installments: 1,
      }),
    ).rejects.toThrow(/até 2 pedidos/i);

    // Outro IP continua livre para comprar.
    const other = appRouter.createCaller(context(undefined, "177.9.9.9"));
    const created = await other.store.createOrder({
      ...baseOrder,
      paymentMethod: "card",
      installments: 1,
    });
    expect(created.reference).toBe("TG-000001");
  });

  it("guarda o IP do cliente no pedido, usando o primeiro x-forwarded-for", async () => {
    const caller = appRouter.createCaller(
      context(undefined, "189.10.20.30, 10.0.0.1"),
    );
    await caller.store.createOrder({
      ...baseOrder,
      paymentMethod: "card",
      installments: 1,
    });

    expect(state.inserted[0]).toMatchObject({ clientIp: "189.10.20.30" });
  });

  it("desativa o limite quando maxOrdersPerIp é 0", async () => {
    state.settings = { maxOrdersPerIp: "0" };
    state.ordersByIp["200.1.2.3"] = 99;

    const caller = appRouter.createCaller(context());
    const created = await caller.store.createOrder({
      ...baseOrder,
      paymentMethod: "card",
      installments: 1,
    });

    expect(created.reference).toBe("TG-000001");
  });

  it("expõe a disponibilidade pública por dosagem", async () => {
    const caller = appRouter.createCaller(context());
    const result = await caller.store.availability();

    expect(result.stock).toEqual([
      { dosage: "15mg", available: 5, lot: 10 },
      { dosage: "10mg", available: 1, lot: 14 },
      { dosage: "5mg", available: 0, lot: 18 },
    ]);
  });
});

describe("store.admin", () => {
  it("registra o aviso de pagamento e notifica o dono", async () => {
    state.settings = {
      pixKey: "loja@tg.com.br",
      pixReceiverName: "Loja TG",
      pixCity: "Sao Paulo",
    };

    const caller = appRouter.createCaller(context());
    const order = await caller.store.createOrder({
      ...baseOrder,
      paymentMethod: "pix",
      installments: 1,
    });
    // Pedido recém-criado nasce como pendente.
    state.inserted[0].status = "pending";
    state.notifications = [];

    const result = await caller.store.claimPayment({
      reference: order.reference,
    });

    expect(result.status).toBe("awaiting_confirmation");
    expect(state.claims).toEqual([order.reference]);
    expect(state.notifications[0].title).toContain("Pagamento informado");
    expect(state.notifications[0].content).toContain("Maria Souza");
  });

  it("não altera pedidos já confirmados e recusa referência inexistente", async () => {
    state.settings = {
      pixKey: "loja@tg.com.br",
      pixReceiverName: "Loja TG",
      pixCity: "Sao Paulo",
    };

    const caller = appRouter.createCaller(context());
    const order = await caller.store.createOrder({
      ...baseOrder,
      paymentMethod: "pix",
      installments: 1,
    });
    state.inserted[0].status = "paid";

    const result = await caller.store.claimPayment({
      reference: order.reference,
    });
    expect(result.status).toBe("paid");
    expect(state.claims).toHaveLength(0);

    await expect(
      caller.store.claimPayment({ reference: "TG-999999" }),
    ).rejects.toThrow(/não encontrado/i);
  });

  it("bloqueia acesso de quem não é administrador", async () => {
    await expect(
      appRouter.createCaller(context()).store.admin.orders(),
    ).rejects.toThrow();

    await expect(
      appRouter.createCaller(context("user")).store.admin.orders(),
    ).rejects.toThrow();
  });

  it("permite ao admin listar pedidos e salvar a chave Pix", async () => {
    const caller = appRouter.createCaller(context("admin"));

    await caller.store.admin.saveSettings({
      pixKey: "11999998888",
      pixKeyType: "telefone",
      pixReceiverName: "Loja TG",
      pixCity: "Recife",
      maxOrdersPerIp: 3,
      ipWindowHours: 12,
    });

    const settings = await caller.store.admin.settings();
    expect(settings.pixKey).toBe("11999998888");
    expect(settings.pixKeyType).toBe("telefone");
    expect(settings.maxOrdersPerIp).toBe(3);
    expect(settings.ipWindowHours).toBe(12);

    const status = await appRouter.createCaller(context()).store.pixStatus();
    expect(status.configured).toBe(true);

    const orders = await caller.store.admin.orders();
    expect(Array.isArray(orders)).toBe(true);
  });
});

describe("store.lookupCep", () => {
  it("rejeita CEP com quantidade inválida de dígitos", async () => {
    const caller = appRouter.createCaller(context());
    await expect(caller.store.lookupCep({ cep: "123" })).rejects.toThrow(
      /8 dígitos/,
    );
  });

  it("normaliza a resposta do ViaCEP", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        logradouro: "Avenida Paulista",
        bairro: "Bela Vista",
        localidade: "São Paulo",
        uf: "SP",
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const caller = appRouter.createCaller(context());
    const result = await caller.store.lookupCep({ cep: "01310100" });

    expect(result).toEqual({
      cep: "01310-100",
      address: "Avenida Paulista",
      district: "Bela Vista",
      city: "São Paulo",
      state: "SP",
    });

    vi.unstubAllGlobals();
  });
});

/** Cria um pedido Pix pronto para os testes de conversão e cobrança. */
async function seedPixOrder() {
  state.settings = {
    pixKey: "loja@tg.com.br",
    pixReceiverName: "Loja TG",
    pixCity: "Sao Paulo",
    metaPixelId: "1234567890123456",
    metaCapiToken: "EAAG-token",
  };

  const caller = appRouter.createCaller(context());
  return caller.store.createOrder({
    ...baseOrder,
    paymentMethod: "pix",
    installments: 1,
  });
}

describe("admin.updateStatus e a Conversions API do Meta", () => {
  it("envia a compra ao Meta ao marcar o pedido como pago", async () => {
    await seedPixOrder();
    const admin = appRouter.createCaller(context("admin"));

    const result = await admin.store.admin.updateStatus({
      id: 1,
      status: "paid",
    });

    expect(result.capi).toEqual({ sent: true });
    expect(state.capiCalls).toEqual([{ reference: "TG-000001", total: 1740 }]);
  });

  it("não envia conversão em status diferente de pago", async () => {
    await seedPixOrder();
    const admin = appRouter.createCaller(context("admin"));

    await admin.store.admin.updateStatus({ id: 1, status: "shipped" });

    expect(state.capiCalls).toHaveLength(0);
  });

  it("não duplica a conversão se o admin marcar como pago outra vez", async () => {
    await seedPixOrder();
    const admin = appRouter.createCaller(context("admin"));

    await admin.store.admin.updateStatus({ id: 1, status: "paid" });
    const segunda = await admin.store.admin.updateStatus({
      id: 1,
      status: "paid",
    });

    expect(state.capiCalls).toHaveLength(1);
    expect(segunda.capi?.sent).toBe(false);
    expect(segunda.capi?.reason).toMatch(/já enviada/i);
  });

  it("informa o motivo quando falta o token da Conversions API", async () => {
    await seedPixOrder();
    state.settings.metaCapiToken = "";
    const admin = appRouter.createCaller(context("admin"));

    const result = await admin.store.admin.updateStatus({
      id: 1,
      status: "paid",
    });

    expect(result.success).toBe(true);
    expect(result.capi?.sent).toBe(false);
    expect(result.capi?.reason).toMatch(/Conversions API/i);
    expect(state.capiCalls).toHaveLength(0);
  });

  it("libera a trava quando o Meta recusa, permitindo nova tentativa", async () => {
    await seedPixOrder();
    state.capiShouldFail = true;
    const admin = appRouter.createCaller(context("admin"));

    const falha = await admin.store.admin.updateStatus({
      id: 1,
      status: "paid",
    });
    expect(falha.capi?.sent).toBe(false);
    expect(state.capiSent).toHaveLength(0);

    state.capiShouldFail = false;
    const nova = await admin.store.admin.updateStatus({
      id: 1,
      status: "paid",
    });
    expect(nova.capi?.sent).toBe(true);
    expect(state.capiCalls).toHaveLength(2);
  });

  it("marca o pedido como pago mesmo com o rastreamento desativado", async () => {
    await seedPixOrder();
    state.settings.trackingEnabled = "0";
    const admin = appRouter.createCaller(context("admin"));

    const result = await admin.store.admin.updateStatus({
      id: 1,
      status: "paid",
    });

    expect(result.success).toBe(true);
    expect(result.capi?.sent).toBe(false);
    expect(state.capiCalls).toHaveLength(0);
  });
});

describe("admin.whatsappCharge", () => {
  it("monta o link do WhatsApp com valor, referência e código Pix", async () => {
    const order = await seedPixOrder();
    const admin = appRouter.createCaller(context("admin"));

    const result = await admin.store.admin.whatsappCharge({ id: 1 });

    expect(result.phone).toBe("5511988887777");
    expect(result.url).toContain("https://wa.me/5511988887777?text=");
    expect(result.pixPayload).toBe(order.pixPayload);

    const message = decodeURIComponent(result.url.split("?text=")[1] ?? "");
    expect(message).toContain("TG-000001");
    expect(message).toContain("1.740,00");
    expect(message).toContain(order.pixPayload ?? "");
    expect(message).toContain("Maria");
    expect(state.chargesSent).toEqual([1]);
  });

  it("gera o Pix na hora para pedido de cartão recusado", async () => {
    state.settings = {
      pixKey: "loja@tg.com.br",
      pixReceiverName: "Loja TG",
      pixCity: "Sao Paulo",
    };

    const caller = appRouter.createCaller(context());
    await caller.store.createOrder({
      ...baseOrder,
      paymentMethod: "card",
      installments: 3,
      cardBrand: "visa",
      cardLast4: "1111",
      cardHolder: "MARIA SOUZA",
    });

    expect(state.inserted[0].pixPayload).toBeFalsy();

    const admin = appRouter.createCaller(context("admin"));
    const result = await admin.store.admin.whatsappCharge({ id: 1 });

    expect(result.pixPayload).toContain("loja@tg.com.br");
    expect(result.pixPayload).toContain("54071740.00");
  });

  it("exige a chave Pix cadastrada antes de cobrar", async () => {
    state.settings = {
      pixKey: "loja@tg.com.br",
      pixReceiverName: "Loja TG",
      pixCity: "Sao Paulo",
    };
    const caller = appRouter.createCaller(context());
    await caller.store.createOrder({
      ...baseOrder,
      paymentMethod: "card",
      installments: 1,
      cardBrand: "visa",
      cardLast4: "1111",
      cardHolder: "MARIA SOUZA",
    });

    state.settings.pixKey = "";
    const admin = appRouter.createCaller(context("admin"));

    await expect(admin.store.admin.whatsappCharge({ id: 1 })).rejects.toThrow(
      /chave Pix/i,
    );
  });

  it("recusa telefone incompleto", async () => {
    state.settings = {
      pixKey: "loja@tg.com.br",
      pixReceiverName: "Loja TG",
      pixCity: "Sao Paulo",
    };
    const caller = appRouter.createCaller(context());
    await caller.store.createOrder({
      ...baseOrder,
      phone: "1198888",
      paymentMethod: "pix",
      installments: 1,
    });

    const admin = appRouter.createCaller(context("admin"));
    await expect(admin.store.admin.whatsappCharge({ id: 1 })).rejects.toThrow(
      /telefone/i,
    );
  });

  it("bloqueia visitante sem papel de admin", async () => {
    await seedPixOrder();
    const caller = appRouter.createCaller(context());

    await expect(
      caller.store.admin.whatsappCharge({ id: 1 }),
    ).rejects.toThrow();
  });
});
