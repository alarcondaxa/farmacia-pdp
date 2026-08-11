import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { buildPixPayload } from "@shared/pix";
import {
  claimOrderPayment,
  clearCapiSent,
  countOrdersByIp,
  createOrder,
  decrementStock,
  deleteOrder,
  getClickStats,
  getNextOrderSequence,
  getOrderById,
  getOrderByReference,
  getSettings,
  listOrders,
  listStock,
  markCapiSent,
  markChargeSent,
  recordClick,
  restoreStock,
  saveSettings,
  setOrderPixPayload,
  updateOrderStatus,
  upsertStock,
} from "../db";
import { adminProcedure, publicProcedure, router } from "../_core/trpc";
import { notifyOwner } from "../_core/notification";
import { sendPurchaseToMeta } from "../metaCapi";

const orderItemSchema = z.object({
  sku: z.string(),
  name: z.string(),
  dosage: z.string(),
  quantity: z.number().int().min(1).max(20),
  unitPrice: z.number().min(0),
  listPrice: z.number().min(0),
  image: z.string().optional(),
});

const checkoutSchema = z.object({
  customerName: z.string().min(3).max(200),
  email: z.string().email().max(320),
  cpf: z.string().min(11).max(20),
  phone: z.string().min(8).max(30),
  cep: z.string().min(8).max(12),
  address: z.string().min(3).max(255),
  number: z.string().min(1).max(20),
  complement: z.string().max(120).optional(),
  district: z.string().min(2).max(120),
  city: z.string().min(2).max(120),
  state: z.string().min(2).max(4),
  paymentMethod: z.enum(["pix", "card"]),
  installments: z.number().int().min(1).max(3).default(1),
  /**
   * Dados NÃO sensíveis do cartão. O servidor recusa qualquer tentativa de
   * enviar número completo, validade ou CVV: só bandeira, 4 últimos e nome.
   */
  cardBrand: z.string().max(20).optional(),
  cardLast4: z
    .string()
    .regex(/^\d{4}$/, "Informe apenas os 4 últimos dígitos")
    .optional(),
  cardHolder: z.string().max(120).optional(),
  items: z.array(orderItemSchema).min(1),
});

/** Total calculado no servidor, para não confiar no valor enviado pelo cliente. */
function calculateTotal(items: z.infer<typeof orderItemSchema>[]): number {
  const cents = items.reduce(
    (sum, item) => sum + Math.round(item.unitPrice * 100) * item.quantity,
    0,
  );
  return cents / 100;
}

type OrderItem = z.infer<typeof orderItemSchema>;

/**
 * Lê os itens gravados em JSON. Um registro corrompido não pode derrubar a
 * consulta do pedido nem o painel: devolvemos lista vazia e registramos no log.
 */
function parseItems(raw: string, reference: string): OrderItem[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OrderItem[]) : [];
  } catch (error) {
    console.error(`[Pedido ${reference}] Itens ilegíveis:`, error);
    return [];
  }
}

/** Valor padrão quando a configuração ainda não foi definida pelo admin. */
const DEFAULT_MAX_ORDERS_PER_IP = 2;
const DEFAULT_IP_WINDOW_HOURS = 24;

/**
 * Envia a compra de um pedido pago ao Meta pela Conversions API.
 *
 * Roda no servidor justamente para recuperar as conversões que o pixel do
 * navegador perde (bloqueadores, ITP, modo restrito). Nunca lança: se o token
 * estiver ausente ou o Meta recusar, o pedido continua marcado como pago e o
 * motivo é apenas devolvido ao painel.
 */
async function sendOrderConversion(
  orderId: number,
): Promise<{ sent: boolean; reason?: string }> {
  try {
    const [order, settings] = await Promise.all([
      getOrderById(orderId),
      getSettings(),
    ]);

    if (!order) return { sent: false, reason: "Pedido não encontrado" };

    const trackingOn = (settings.trackingEnabled ?? "1") !== "0";
    if (!trackingOn) {
      return { sent: false, reason: "Rastreamento desativado no painel" };
    }

    const pixelId = settings.metaPixelId ?? "";
    const accessToken = settings.metaCapiToken ?? "";
    if (!pixelId || !accessToken) {
      return {
        sent: false,
        reason: "Informe o Meta Pixel ID e o token da Conversions API",
      };
    }

    // Trava de idempotência: se outra chamada já registrou o envio, para aqui.
    const first = await markCapiSent(orderId);
    if (!first) {
      return { sent: false, reason: "Conversão já enviada anteriormente" };
    }

    const items = parseItems(order.items, order.reference);

    const result = await sendPurchaseToMeta(
      {
        reference: order.reference,
        customerName: order.customerName,
        email: order.email,
        phone: order.phone,
        cpf: order.cpf,
        cep: order.cep,
        city: order.city,
        state: order.state,
        total: Number(order.total),
        clientIp: order.clientIp,
        contents: items.map(item => ({
          id: `${item.sku}-${item.dosage}`,
          quantity: item.quantity,
          price: item.unitPrice,
        })),
      },
      {
        pixelId,
        accessToken,
        testEventCode: settings.metaTestEventCode || undefined,
      },
    );

    if (!result.sent) {
      // Libera a trava para permitir uma nova tentativa depois.
      await clearCapiSent(orderId);
      console.error(`[CAPI ${order.reference}] ${result.reason}`);
      return { sent: false, reason: result.reason };
    }

    return { sent: true };
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "Falha ao enviar conversão";
    console.error("[CAPI] Erro inesperado:", error);
    return { sent: false, reason };
  }
}

/**
 * Extrai o IP real do visitante. Em produção a aplicação fica atrás de um
 * proxy, então `x-forwarded-for` traz a cadeia de IPs e o primeiro item é o
 * cliente original.
 */
function resolveClientIp(req: {
  headers: Record<string, unknown>;
  ip?: string;
  socket?: { remoteAddress?: string };
}): string {
  const forwarded = req.headers["x-forwarded-for"];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const first =
    typeof raw === "string" ? raw.split(",")[0]?.trim() : undefined;

  const candidate =
    first ||
    (typeof req.headers["x-real-ip"] === "string"
      ? (req.headers["x-real-ip"] as string)
      : undefined) ||
    req.ip ||
    req.socket?.remoteAddress ||
    "";

  // Normaliza o formato IPv4 mapeado em IPv6 (::ffff:189.1.2.3).
  return candidate.replace(/^::ffff:/, "").slice(0, 64) || "desconhecido";
}

export const storeRouter = router({
  /** Consulta de endereço por CEP usando a API pública ViaCEP. */
  lookupCep: publicProcedure
    .input(z.object({ cep: z.string() }))
    .query(async ({ input }) => {
      const digits = input.cep.replace(/\D/g, "");
      if (digits.length !== 8) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "CEP deve conter 8 dígitos",
        });
      }

      const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      if (!response.ok) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Não foi possível consultar o CEP agora",
        });
      }

      const data = (await response.json()) as {
        erro?: boolean | string;
        logradouro?: string;
        bairro?: string;
        localidade?: string;
        uf?: string;
      };

      if (data.erro) {
        throw new TRPCError({ code: "NOT_FOUND", message: "CEP não encontrado" });
      }

      return {
        cep: digits.replace(/(\d{5})(\d{3})/, "$1-$2"),
        address: data.logradouro ?? "",
        district: data.bairro ?? "",
        city: data.localidade ?? "",
        state: data.uf ?? "",
      };
    }),

  /** Informa ao checkout se o Pix já está configurado pelo administrador. */
  pixStatus: publicProcedure.query(async () => {
    const settings = await getSettings();
    return { configured: Boolean(settings.pixKey) };
  }),

  /**
   * IDs de rastreamento visíveis ao navegador. Só devolve os identificadores
   * públicos (que já ficariam expostos no HTML de qualquer site) — o token da
   * Conversions API nunca sai do servidor.
   */
  tracking: publicProcedure.query(async () => {
    const settings = await getSettings();
    const enabled = (settings.trackingEnabled ?? "1") !== "0";

    return {
      enabled,
      metaPixelId: enabled ? (settings.metaPixelId ?? "") : "",
      ga4MeasurementId: enabled ? (settings.ga4MeasurementId ?? "") : "",
      googleAdsId: enabled ? (settings.googleAdsId ?? "") : "",
      googleAdsPurchaseLabel: enabled
        ? (settings.googleAdsPurchaseLabel ?? "")
        : "",
      gtmId: enabled ? (settings.gtmId ?? "") : "",
    };
  }),

  /**
   * Disponibilidade pública por dosagem, usada na vitrine e no checkout.
   * Sai do banco, então o número mostrado é o mesmo que o servidor valida.
   */
  availability: publicProcedure.query(async () => {
    const [rows, settings] = await Promise.all([listStock(), getSettings()]);

    return {
      maxPerOrder: Number(settings.maxOrdersPerIp || DEFAULT_MAX_ORDERS_PER_IP),
      stock: rows.map(row => ({
        dosage: row.dosage,
        available: row.available,
        lot: row.lot,
      })),
    };
  }),

  /** Registra um clique vindo do frontend. Procedimento público. */
  trackClick: publicProcedure
    .input(
      z.object({
        elementId: z.string().max(128),
        elementText: z.string().max(500).optional(),
        pageUrl: z.string().max(500),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      await recordClick({
        ...input,
        clientIp: ctx.req.ip,
      });
      return { success: true };
    }),

  /** Registra o pedido e devolve o Pix copia-e-cola quando aplicável. */
  createOrder: publicProcedure
    .input(checkoutSchema)
    .mutation(async ({ input, ctx }) => {
      const clientIp = resolveClientIp(ctx.req as never);
      const settings = await getSettings();

      // 1) Limite de pedidos por IP -------------------------------------
      const maxPerIp = Number(
        settings.maxOrdersPerIp || DEFAULT_MAX_ORDERS_PER_IP,
      );
      const windowHours = Number(
        settings.ipWindowHours ?? DEFAULT_IP_WINDOW_HOURS,
      );

      if (maxPerIp > 0) {
        const already = await countOrdersByIp(clientIp, windowHours);
        if (already >= maxPerIp) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message:
              maxPerIp === 1
                ? "Cada cliente pode fazer apenas 1 pedido nesta promoção. Fale com o atendimento para liberar uma nova compra."
                : `Cada cliente pode fazer até ${maxPerIp} pedidos nesta promoção. Fale com o atendimento para liberar uma nova compra.`,
          });
        }
      }

      // 2) Estoque disponível por dosagem ------------------------------
      // Agrupa por dosagem para o caso de o carrinho repetir a mesma opção.
      const requested = new Map<string, number>();
      for (const item of input.items) {
        requested.set(
          item.dosage,
          (requested.get(item.dosage) ?? 0) + item.quantity,
        );
      }

      const stockRows = await listStock();
      const stockByDosage = new Map(stockRows.map(row => [row.dosage, row]));

      for (const [dosage, quantity] of Array.from(requested.entries())) {
        const row = stockByDosage.get(dosage);
        if (!row) continue; // dosagem sem controle de estoque cadastrado
        if (row.available < quantity) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              row.available === 0
                ? `A dosagem ${dosage} está esgotada nesta promoção.`
                : `Restam apenas ${row.available} unidade(s) de ${dosage} nesta promoção. Ajuste a quantidade para continuar.`,
          });
        }
      }

      // Baixa atômica: se outra compra levar a última unidade entre a
      // checagem e agora, o UPDATE não afeta linhas e devolvemos o estoque
      // já baixado antes de recusar o pedido.
      const taken: { dosage: string; quantity: number }[] = [];
      for (const [dosage, quantity] of Array.from(requested.entries())) {
        if (!stockByDosage.has(dosage)) continue;
        const ok = await decrementStock(dosage, quantity);
        if (!ok) {
          for (const done of taken) {
            await restoreStock(done.dosage, done.quantity);
          }
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `A dosagem ${dosage} acabou de esgotar nesta promoção. Recarregue a página para ver as opções disponíveis.`,
          });
        }
        taken.push({ dosage, quantity });
      }

      const total = calculateTotal(input.items);

      if (input.paymentMethod === "pix" && !settings.pixKey) {
        // Devolve o estoque reservado antes de abortar.
        for (const done of taken) {
          await restoreStock(done.dosage, done.quantity);
        }
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "A chave Pix ainda não foi configurada pela loja. Escolha cartão ou tente novamente mais tarde.",
        });
      }

      // Dois checkouts simultâneos podem calcular a mesma sequência; o índice
      // único de `reference` recusa a segunda gravação, então tentamos a
      // sequência seguinte em vez de perder o pedido.
      const baseSequence = await getNextOrderSequence();
      let reference = "";
      let pixPayload: string | null = null;
      let order: Awaited<ReturnType<typeof createOrder>> | undefined;
      let lastError: unknown = null;

      for (let attempt = 0; attempt < 5; attempt += 1) {
        reference = `TG-${(baseSequence + attempt).toString().padStart(6, "0")}`;
        pixPayload =
          input.paymentMethod === "pix"
            ? buildPixPayload({
                key: settings.pixKey,
                merchantName: settings.pixReceiverName || "LOJA TG",
                merchantCity: settings.pixCity || "SAO PAULO",
                amount: total,
                txid: reference,
              })
            : null;

        try {
          order = await createOrder({
            reference,
            customerName: input.customerName,
            email: input.email,
            cpf: input.cpf,
            phone: input.phone,
            cep: input.cep,
            address: input.address,
            number: input.number,
            complement: input.complement ?? null,
            district: input.district,
            city: input.city,
            state: input.state.toUpperCase(),
            paymentMethod: input.paymentMethod,
            installments: input.paymentMethod === "card" ? input.installments : 1,
            cardBrand:
              input.paymentMethod === "card" ? (input.cardBrand ?? null) : null,
            cardLast4:
              input.paymentMethod === "card" ? (input.cardLast4 ?? null) : null,
            cardHolder:
              input.paymentMethod === "card" ? (input.cardHolder ?? null) : null,
            total: total.toFixed(2),
            items: JSON.stringify(input.items),
            pixPayload,
            // Cartão não é autorizado por este site (nenhum processador
            // conectado): o pedido fica gravado com a tentativa recusada.
            status: input.paymentMethod === "card" ? "card_declined" : "pending",
            clientIp,
          });
          break;
        } catch (error) {
          lastError = error;
          const message = error instanceof Error ? error.message : "";
          // Só vale repetir quando a falha foi de referência duplicada.
          if (!/duplicate|ER_DUP_ENTRY/i.test(message)) break;
        }
      }

      if (!order) {
        // Nada foi gravado: devolve o estoque para não sumir com unidades.
        for (const done of taken) {
          await restoreStock(done.dosage, done.quantity);
        }
        console.error("[Pedido] Falha ao gravar o pedido:", lastError);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "Não foi possível registrar seu pedido agora. Tente novamente em instantes.",
        });
      }

      // Avisa o dono da loja para que nenhum pedido passe despercebido.
      // Falha na notificação não pode invalidar o pedido já gravado.
      try {
        const itemsSummary = input.items
          .map(item => `${item.quantity}x ${item.dosage}`)
          .join(", ");

        await notifyOwner({
          title: `${
            input.paymentMethod === "card"
              ? "Cartão recusado"
              : "Novo pedido"
          } ${reference} — ${total.toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
          })}`,
          content: [
            `Cliente: ${input.customerName}`,
            `Contato: ${input.phone} · ${input.email}`,
            `CPF: ${input.cpf}`,
            `Itens: ${itemsSummary}`,
            `Pagamento: ${
              input.paymentMethod === "pix"
                ? "Pix"
                : `Cartão NÃO autorizado — ${input.cardBrand ?? ""} ****${
                    input.cardLast4 ?? "----"
                  } em ${input.installments}x`
            }`,
            `Entrega: ${input.address}, ${input.number}${
              input.complement ? ` (${input.complement})` : ""
            } — ${input.district}, ${input.city}/${input.state.toUpperCase()} — CEP ${input.cep}`,
          ].join("\n"),
        });
      } catch (error) {
        console.error("[Pedido] Falha ao notificar o dono da loja:", error);
      }

      return {
        reference,
        total,
        paymentMethod: input.paymentMethod,
        installments: order?.installments ?? 1,
        pixPayload,
        /** Cartão sempre volta como recusado enquanto não houver processador. */
        declined: input.paymentMethod === "card",
      };
    }),

  /** Consulta pública de um pedido pela referência (tela de confirmação). */
  getOrder: publicProcedure
    .input(z.object({ reference: z.string().min(3) }))
    .query(async ({ input }) => {
      const order = await getOrderByReference(input.reference);
      if (!order) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Pedido não encontrado" });
      }

      return {
        reference: order.reference,
        customerName: order.customerName,
        total: Number(order.total),
        paymentMethod: order.paymentMethod,
        installments: order.installments,
        cardBrand: order.cardBrand,
        cardLast4: order.cardLast4,
        pixPayload: order.pixPayload,
        status: order.status,
        createdAt: order.createdAt,
        items: parseItems(order.items, order.reference),
      };
    }),

  /**
   * Cliente declara que pagou o Pix. Marca o pedido como
   * "aguardando confirmação" e avisa o dono; a baixa efetiva é manual.
   */
  claimPayment: publicProcedure
    .input(z.object({ reference: z.string().min(3).max(32) }))
    .mutation(async ({ input }) => {
      const order = await getOrderByReference(input.reference);
      if (!order) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Pedido não encontrado",
        });
      }

      // Cartão recusado ainda não tem Pix: avisar pagamento aqui não faz
      // sentido e daria um falso "recebemos seu aviso" ao cliente.
      if (order.status === "card_declined") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Gere o Pix deste pedido antes de informar o pagamento.",
        });
      }

      if (order.status === "canceled") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Este pedido foi cancelado. Faça um novo pedido para continuar.",
        });
      }

      // Já confirmado ou finalizado: nada a fazer, resposta idempotente.
      if (order.status !== "pending") {
        return { status: order.status } as const;
      }

      await claimOrderPayment(input.reference);

      try {
        await notifyOwner({
          title: `Pagamento informado — ${order.reference}`,
          content: [
            `${order.customerName} informou que pagou o Pix.`,
            `Valor: ${Number(order.total).toLocaleString("pt-BR", {
              style: "currency",
              currency: "BRL",
            })}`,
            `Contato: ${order.phone} · ${order.email}`,
            "Confirme o recebimento no seu banco e marque o pedido como Pago no painel.",
          ].join("\n"),
        });
      } catch (error) {
        console.error("[Pedido] Falha ao notificar aviso de pagamento:", error);
      }

      return { status: "awaiting_confirmation" } as const;
    }),

  /**
   * Converte um pedido recusado no cartão para pagamento via Pix, reaproveitando
   * os dados já informados pelo cliente (nada é digitado de novo).
   */
  switchToPix: publicProcedure
    .input(z.object({ reference: z.string().min(3).max(32) }))
    .mutation(async ({ input }) => {
      const order = await getOrderByReference(input.reference);
      if (!order) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Pedido não encontrado",
        });
      }

      // Já tem Pix gerado: devolve o mesmo código, resposta idempotente.
      if (order.pixPayload) {
        return { pixPayload: order.pixPayload } as const;
      }

      if (order.status === "paid" || order.status === "shipped") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Este pedido já foi pago.",
        });
      }

      // Pedido cancelado já devolveu as unidades ao lote: gerar Pix aqui
      // criaria uma cobrança sem reserva de estoque.
      if (order.status === "canceled") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Este pedido foi cancelado. Faça um novo pedido para pagar com Pix.",
        });
      }

      const settings = await getSettings();
      if (!settings.pixKey) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "A chave Pix ainda não foi configurada pela loja. Entre em contato para concluir o pagamento.",
        });
      }

      const pixPayload = buildPixPayload({
        key: settings.pixKey,
        merchantName: settings.pixReceiverName || "LOJA TG",
        merchantCity: settings.pixCity || "SAO PAULO",
        amount: Number(order.total),
        txid: order.reference,
      });

      await setOrderPixPayload(order.reference, pixPayload);

      return { pixPayload } as const;
    }),

  admin: router({
    /** Estatísticas de cliques para o dashboard. */
    clickStats: adminProcedure.query(async () => {
      return getClickStats();
    }),

    /** Lista completa de pedidos com todos os dados informados pelo cliente. */
    orders: adminProcedure.query(async () => {
      const rows = await listOrders();
      return rows.map(order => ({
        ...order,
        total: Number(order.total),
        items: parseItems(order.items, order.reference),
      }));
    }),

    settings: adminProcedure.query(async () => {
      const settings = await getSettings();
      return {
        pixKey: settings.pixKey ?? "",
        pixKeyType: settings.pixKeyType ?? "aleatoria",
        pixReceiverName: settings.pixReceiverName ?? "",
        pixCity: settings.pixCity ?? "",
        storeWhatsapp: settings.storeWhatsapp ?? "",
        maxOrdersPerIp: Number(
          settings.maxOrdersPerIp || DEFAULT_MAX_ORDERS_PER_IP,
        ),
        ipWindowHours: Number(settings.ipWindowHours ?? DEFAULT_IP_WINDOW_HOURS),
        /* Rastreamento de conversões */
        trackingEnabled: (settings.trackingEnabled ?? "1") !== "0",
        metaPixelId: settings.metaPixelId ?? "",
        metaCapiToken: settings.metaCapiToken ?? "",
        metaTestEventCode: settings.metaTestEventCode ?? "",
        ga4MeasurementId: settings.ga4MeasurementId ?? "",
        googleAdsId: settings.googleAdsId ?? "",
        googleAdsPurchaseLabel: settings.googleAdsPurchaseLabel ?? "",
        gtmId: settings.gtmId ?? "",
      };
    }),

    saveSettings: adminProcedure
      .input(
        z.object({
          pixKey: z.string().max(200),
          pixKeyType: z.enum(["cpf", "cnpj", "email", "telefone", "aleatoria"]),
          pixReceiverName: z.string().max(100),
          pixCity: z.string().max(60),
          storeWhatsapp: z.string().max(30).optional(),
          /** 0 desativa o limite por IP. */
          maxOrdersPerIp: z.number().int().min(0).max(50),
          /** 0 aplica o limite sem janela de tempo (vale para sempre). */
          ipWindowHours: z.number().int().min(0).max(8760),
          /* ---- Rastreamento de conversões ---- */
          trackingEnabled: z.boolean().default(true),
          /** Meta Pixel: 15 ou 16 dígitos. */
          metaPixelId: z
            .string()
            .trim()
            .regex(/^\d{15,16}$/, "O ID do Meta Pixel tem 15 ou 16 dígitos")
            .or(z.literal(""))
            .default(""),
          metaCapiToken: z.string().trim().max(400).default(""),
          /** Código TEST do Events Manager, usado só durante a validação. */
          metaTestEventCode: z.string().trim().max(40).default(""),
          /** GA4: formato G-XXXXXXXXXX. */
          ga4MeasurementId: z
            .string()
            .trim()
            .regex(/^G-[A-Z0-9]{6,12}$/i, "O ID do GA4 começa com G-")
            .or(z.literal(""))
            .default(""),
          /** Google Ads: formato AW-123456789. */
          googleAdsId: z
            .string()
            .trim()
            .regex(/^AW-\d{9,12}$/i, "O ID do Google Ads começa com AW-")
            .or(z.literal(""))
            .default(""),
          googleAdsPurchaseLabel: z.string().trim().max(60).default(""),
          /** GTM: formato GTM-XXXXXXX. */
          gtmId: z
            .string()
            .trim()
            .regex(/^GTM-[A-Z0-9]{5,10}$/i, "O ID do GTM começa com GTM-")
            .or(z.literal(""))
            .default(""),
        }),
      )
      .mutation(async ({ input }) => {
        // Valida a chave gerando um payload de teste antes de salvar.
        if (input.pixKey.trim()) {
          buildPixPayload({
            key: input.pixKey,
            merchantName: input.pixReceiverName || "LOJA",
            merchantCity: input.pixCity || "SAO PAULO",
            amount: 1,
            txid: "TESTE",
          });
        }

        await saveSettings({
          pixKey: input.pixKey.trim(),
          pixKeyType: input.pixKeyType,
          pixReceiverName: input.pixReceiverName.trim(),
          pixCity: input.pixCity.trim(),
          storeWhatsapp: input.storeWhatsapp?.trim() ?? "",
          maxOrdersPerIp: String(input.maxOrdersPerIp),
          ipWindowHours: String(input.ipWindowHours),
          trackingEnabled: input.trackingEnabled ? "1" : "0",
          metaPixelId: input.metaPixelId,
          metaCapiToken: input.metaCapiToken,
          metaTestEventCode: input.metaTestEventCode,
          ga4MeasurementId: input.ga4MeasurementId.toUpperCase(),
          googleAdsId: input.googleAdsId.toUpperCase(),
          googleAdsPurchaseLabel: input.googleAdsPurchaseLabel,
          gtmId: input.gtmId.toUpperCase(),
        });

        return { success: true } as const;
      }),

    /** Estoque atual de cada dosagem, para edição no painel. */
    stock: adminProcedure.query(async () => {
      const rows = await listStock();
      return rows.map(row => ({
        dosage: row.dosage,
        available: row.available,
        lot: row.lot,
      }));
    }),

      saveStock: adminProcedure
        .input(
          z.object({
            items: z
              .array(
                z.object({
                  dosage: z.string().min(1).max(20),
                  available: z.number().int().min(0).max(9999),
                  lot: z.number().int().min(1).max(9999),
                }),
              )
              .min(1),
          }),
        )
        .mutation(async ({ input }) => {
          for (const item of input.items) {
            // O disponível nunca pode passar do lote: a barra de progresso da
            // vitrine usa a razão entre os dois.
            await upsertStock(
              item.dosage,
              Math.min(item.available, item.lot),
              item.lot,
            );
          }
          return { ok: true } as const;
        }),

    updateStatus: adminProcedure
      .input(
        z.object({
          id: z.number().int(),
          status: z.enum([
            "pending",
            "awaiting_confirmation",
            "card_declined",
            "paid",
            "shipped",
            "canceled",
          ]),
        }),
      )
      .mutation(async ({ input }) => {
        // Cancelar devolve as unidades ao estoque promocional, uma única vez.
        if (input.status === "canceled") {
          const order = await getOrderById(input.id);
          if (order && order.status !== "canceled") {
            const items = parseItems(order.items, order.reference);
            for (const item of items) {
              await restoreStock(item.dosage, item.quantity);
            }
          }
        }

        await updateOrderStatus(input.id, input.status);

        // Conversão confirmada: envia a compra ao Meta pela Conversions API.
        // Só acontece em "paid", porque é o único momento em que a receita é
        // real. A trava `markCapiSent` impede duplicar se o admin repetir.
        let capi: { sent: boolean; reason?: string } | undefined;

        if (input.status === "paid") {
          capi = await sendOrderConversion(input.id);
        }

        return { success: true, capi } as const;
      }),

    deleteOrder: adminProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ input }) => {
        // Apagar um pedido ainda ativo também libera o estoque reservado.
        const order = await getOrderById(input.id);
        if (order && order.status !== "canceled") {
          const items = parseItems(order.items, order.reference);
          for (const item of items) {
            await restoreStock(item.dosage, item.quantity);
          }
        }

        await deleteOrder(input.id);
        return { success: true } as const;
      }),

    /**
     * Monta o link do WhatsApp com a cobrança Pix pronta e registra o envio.
     * O admin clica uma vez no painel: o texto já vai com o valor, a referência
     * do pedido e o código copia-e-cola, sem precisar montar nada à mão.
     */
    whatsappCharge: adminProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ input }) => {
        const order = await getOrderById(input.id);
        if (!order) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Pedido não encontrado",
          });
        }

        let pixPayload = order.pixPayload ?? "";

        // Pedido de cartão recusado não tem código Pix: gera agora, usando a
        // chave configurada, para que a cobrança possa ser enviada do mesmo modo.
        if (!pixPayload) {
          const settings = await getSettings();
          const pixKey = settings.pixKey?.trim();

          if (!pixKey) {
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: "Cadastre a chave Pix antes de enviar a cobrança",
            });
          }

          pixPayload = buildPixPayload({
            key: pixKey,
            merchantName: settings.pixReceiverName || "LOJA",
            merchantCity: settings.pixCity || "SAO PAULO",
            amount: Number(order.total),
            txid: order.reference.replace(/[^A-Za-z0-9]/g, "").slice(0, 25),
          });

          await setOrderPixPayload(order.reference, pixPayload);
        }

        const total = Number(order.total).toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        });
        const firstName = order.customerName.trim().split(/\s+/)[0] ?? "";
        const items = parseItems(order.items, order.reference);
        const itemsText = items
          .map(item => `• ${item.quantity}x ${item.name} (${item.dosage})`)
          .join("\n");

        // Duas mensagens: a primeira explica a cobrança, a segunda é só o código,
        // para o cliente copiar sem risco de arrastar texto junto.
        const message = [
          `Olá, ${firstName}! Aqui é da farmácia.`,
          "",
          `Sobre o seu pedido *${order.reference}*:`,
          itemsText,
          "",
          `Valor total: *${total}* (frete grátis)`,
          "",
          "Para concluir, pague com o Pix copia e cola abaixo. Assim que o pagamento cair, seu pedido é liberado para envio.",
          "",
          "Código Pix copia e cola:",
          pixPayload,
        ].join("\n");

        // Telefone em formato internacional exigido pelo wa.me.
        const digits = order.phone.replace(/\D/g, "");
        const phone = digits.startsWith("55") ? digits : `55${digits}`;

        if (digits.length < 10) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "O telefone do cliente está incompleto",
          });
        }

        await markChargeSent(order.id);

        return {
          url: `https://wa.me/${phone}?text=${encodeURIComponent(message)}`,
          phone,
          pixPayload,
        } as const;
      }),
  }),
});
