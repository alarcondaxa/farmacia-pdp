/**
 * Camada de acesso a dados — MongoDB Atlas.
 *
 * A assinatura de todas as funções foi preservada em relação à versão anterior
 * (Drizzle/MySQL), de modo que os routers tRPC continuam funcionando sem
 * alteração. Internamente, cada "tabela" virou uma coleção do MongoDB e o
 * auto-increment numérico é emulado pela coleção `counters`.
 */
import type { InsertOrder, InsertUser } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { getMongo, nextSequence } from "./mongo";

/** Mantido por compatibilidade com chamadas legadas. */
export async function getDb() {
  return getMongo();
}

/* ------------------------------------------------------------------ */
/* Usuários                                                            */
/* ------------------------------------------------------------------ */

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getMongo();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const now = new Date();
    const set: Record<string, unknown> = { updatedAt: now };

    (["name", "email", "loginMethod"] as const).forEach((field) => {
      const value = user[field];
      if (value !== undefined) set[field] = value ?? null;
    });

    set.lastSignedIn = user.lastSignedIn ?? now;

    if (user.role !== undefined) {
      set.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      set.role = "admin";
    }

    const existing = await db.collection("users").findOne({ openId: user.openId });

    if (existing) {
      await db.collection("users").updateOne({ openId: user.openId }, { $set: set });
      return;
    }

    await db.collection("users").insertOne({
      id: await nextSequence("users"),
      openId: user.openId,
      name: null,
      email: null,
      loginMethod: null,
      role: "user",
      createdAt: now,
      ...set,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getMongo();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const user = await db.collection("users").findOne(
    { openId },
    { projection: { _id: 0 } }
  );

  return user ?? undefined;
}

/* ------------------------------------------------------------------ */
/* Configurações da loja (chave Pix etc.)                              */
/* ------------------------------------------------------------------ */

export const SETTING_KEYS = [
  "pixKey",
  "pixReceiverName",
  "pixCity",
  "pixKeyType",
  "storeWhatsapp",
  // Máximo de pedidos que um mesmo IP pode registrar na janela definida.
  "maxOrdersPerIp",
  // Janela em horas considerada no limite por IP (0 = sem janela, vale sempre).
  "ipWindowHours",
  /** Quando ativo, a rota inicial mostra somente uma tela branca. */
  "homepagePaused",
  /* ---- Rastreamento de conversões ---- */
  "metaPixelId",
  /** Código-base colado no painel; o servidor extrai e usa o Pixel ID. */
  "metaPixelCode",
  "metaCapiToken",
  /** Código temporário do Events Manager para validar a Conversions API. */
  "metaTestEventCode",
  "ga4MeasurementId",
  "googleAdsId",
  "googleAdsPurchaseLabel",
  "gtmId",
  "trackingEnabled",
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];

/** Lê todas as configurações em um objeto simples. */
export async function getSettings(): Promise<Record<string, string>> {
  const db = await getMongo();
  if (!db) return {};

  const rows = await db
    .collection<{ settingKey: string; settingValue: string | null }>("settings")
    .find({ settingKey: { $in: [...SETTING_KEYS] } })
    .toArray();

  return rows.reduce<Record<string, string>>((acc, row) => {
    acc[row.settingKey] = row.settingValue ?? "";
    return acc;
  }, {});
}

/** Grava (ou atualiza) um conjunto de configurações. */
export async function saveSettings(values: Record<string, string>): Promise<void> {
  const db = await getMongo();
  if (!db) throw new Error("Banco de dados indisponível");

  const entries = Object.entries(values).filter(([key]) =>
    (SETTING_KEYS as readonly string[]).includes(key)
  );

  for (const [settingKey, settingValue] of entries) {
    await db.collection("settings").updateOne(
      { settingKey },
      { $set: { settingValue, updatedAt: new Date() } },
      { upsert: true }
    );
  }
}

/* ------------------------------------------------------------------ */
/* Pedidos                                                             */
/* ------------------------------------------------------------------ */

export async function createOrder(order: InsertOrder) {
  const db = await getMongo();
  if (!db) throw new Error("Banco de dados indisponível");

  const now = new Date();
  const doc = {
    id: await nextSequence("orders"),
    installments: 1,
    status: "pending" as const,
    complement: null,
    cardBrand: null,
    cardLast4: null,
    cardHolder: null,
    pixPayload: null,
    paymentClaimedAt: null,
    capiSentAt: null,
    chargeSentAt: null,
    clientIp: null,
    notes: null,
    ...order,
    // `total` é decimal no MySQL; no Mongo guardamos string para preservar as
    // duas casas decimais exatamente como o restante do código espera.
    total: String(order.total),
    createdAt: now,
    updatedAt: now,
  };

  await db.collection("orders").insertOne(doc as Record<string, unknown>);

  return db
    .collection("orders")
    .findOne({ reference: order.reference }, { projection: { _id: 0 } }) as any;
}

/**
 * Sequência do código legível do pedido. Usa a quantidade de pedidos já
 * gravados, de modo que a numeração fique curta e previsível: TG-000001...
 *
 * A unicidade real é garantida pelo índice único de `reference`: quem chamar
 * esta função deve tratar a colisão tentando a sequência seguinte.
 */
export async function getNextOrderSequence(): Promise<number> {
  const db = await getMongo();
  if (!db) return 1;

  const total = await db.collection("orders").countDocuments();
  return total + 1;
}

/** Busca um pedido pelo id, sem carregar a lista inteira. */
export async function getOrderById(id: number) {
  const db = await getMongo();
  if (!db) return undefined;

  const order = await db
    .collection("orders")
    .findOne({ id }, { projection: { _id: 0 } });

  return (order ?? undefined) as any;
}

export async function listOrders() {
  const db = await getMongo();
  if (!db) return [];

  return db
    .collection("orders")
    .find({}, { projection: { _id: 0 } })
    .sort({ createdAt: -1 })
    .toArray() as any;
}

export async function getOrderByReference(reference: string) {
  const db = await getMongo();
  if (!db) return undefined;

  const order = await db
    .collection("orders")
    .findOne({ reference }, { projection: { _id: 0 } });

  return (order ?? undefined) as any;
}

export async function updateOrderStatus(
  id: number,
  status:
    | "pending"
    | "awaiting_confirmation"
    | "card_declined"
    | "paid"
    | "shipped"
    | "canceled"
) {
  const db = await getMongo();
  if (!db) throw new Error("Banco de dados indisponível");

  await db
    .collection("orders")
    .updateOne({ id }, { $set: { status, updatedAt: new Date() } });
}

/**
 * Registra que o cliente declarou ter pago. Não confirma o pagamento: apenas
 * sinaliza para o admin conferir no extrato. Só avança a partir de `pending`,
 * para não sobrescrever um pedido já pago, enviado ou cancelado.
 */
export async function claimOrderPayment(reference: string) {
  const db = await getMongo();
  if (!db) throw new Error("Banco de dados indisponível");

  await db.collection("orders").updateOne(
    { reference, status: "pending" },
    {
      $set: {
        status: "awaiting_confirmation",
        paymentClaimedAt: new Date(),
        updatedAt: new Date(),
      },
    }
  );
}

/**
 * Grava o código Pix de um pedido criado sem ele (caso do cartão recusado que
 * o cliente decide pagar via Pix) e devolve o pedido para `pending`.
 */
export async function setOrderPixPayload(reference: string, pixPayload: string) {
  const db = await getMongo();
  if (!db) throw new Error("Banco de dados indisponível");

  await db.collection("orders").updateOne(
    { reference },
    {
      $set: {
        pixPayload,
        paymentMethod: "pix",
        status: "pending",
        updatedAt: new Date(),
      },
    }
  );
}

export async function deleteOrder(id: number) {
  const db = await getMongo();
  if (!db) throw new Error("Banco de dados indisponível");

  await db.collection("orders").deleteOne({ id });
}

/**
 * Marca que a compra já foi enviada ao Meta pela Conversions API.
 * A escrita só acontece se `capiSentAt` ainda estiver vazio, o que evita
 * duplicar a conversão quando o admin marca o pedido como pago mais de uma vez.
 * Devolve `true` quando esta chamada foi a que registrou o envio.
 */
export async function markCapiSent(id: number): Promise<boolean> {
  const db = await getMongo();
  if (!db) throw new Error("Banco de dados indisponível");

  const result = await db.collection("orders").updateOne(
    { id, $or: [{ capiSentAt: null }, { capiSentAt: { $exists: false } }] },
    { $set: { capiSentAt: new Date(), updatedAt: new Date() } }
  );

  return result.modifiedCount > 0;
}

/** Registra o momento em que a cobrança Pix foi enviada pelo WhatsApp. */
export async function markChargeSent(id: number) {
  const db = await getMongo();
  if (!db) throw new Error("Banco de dados indisponível");

  await db
    .collection("orders")
    .updateOne({ id }, { $set: { chargeSentAt: new Date(), updatedAt: new Date() } });
}

/**
 * Libera a trava da Conversions API quando o envio falhou, permitindo tentar de
 * novo. Sem isso, um erro de rede impediria a conversão para sempre.
 */
export async function clearCapiSent(id: number) {
  const db = await getMongo();
  if (!db) throw new Error("Banco de dados indisponível");

  await db
    .collection("orders")
    .updateOne({ id }, { $set: { capiSentAt: null, updatedAt: new Date() } });
}

/* ------------------------------------------------------------------ */
/* Estoque promocional por dosagem                                     */
/* ------------------------------------------------------------------ */

/** Lista o estoque de todas as dosagens, em ordem de cadastro. */
export async function listStock() {
  const db = await getMongo();
  if (!db) return [];

  return db
    .collection("stock")
    .find({}, { projection: { _id: 0 } })
    .sort({ id: 1 })
    .toArray() as any;
}

/** Cria ou atualiza a quantidade disponível de uma dosagem. */
export async function upsertStock(dosage: string, available: number, lot: number) {
  const db = await getMongo();
  if (!db) throw new Error("Banco de dados indisponível");

  const existing = await db.collection("stock").findOne({ dosage });

  if (existing) {
    await db
      .collection("stock")
      .updateOne({ dosage }, { $set: { available, lot, updatedAt: new Date() } });
    return;
  }

  await db.collection("stock").insertOne({
    id: await nextSequence("stock"),
    dosage,
    available,
    lot,
    updatedAt: new Date(),
  });
}

/**
 * Baixa `quantity` unidades da dosagem de forma atômica: o update só afeta o
 * documento quando ainda há saldo suficiente, então duas compras simultâneas
 * não conseguem levar o estoque a um valor negativo.
 *
 * Retorna `true` quando a baixa foi aplicada e `false` quando faltou saldo.
 */
export async function decrementStock(
  dosage: string,
  quantity: number
): Promise<boolean> {
  const db = await getMongo();
  if (!db) throw new Error("Banco de dados indisponível");

  const result = await db.collection("stock").updateOne(
    { dosage, available: { $gte: quantity } },
    { $inc: { available: -quantity }, $set: { updatedAt: new Date() } }
  );

  return result.modifiedCount > 0;
}

/**
 * Devolve unidades ao estoque (pedido cancelado ou apagado), sem nunca passar
 * do tamanho do lote — caso contrário a barra de progresso da vitrine passaria
 * de 100% e o "restam X de Y" ficaria incoerente.
 */
export async function restoreStock(dosage: string, quantity: number) {
  const db = await getMongo();
  if (!db) throw new Error("Banco de dados indisponível");

  const row = await db
    .collection<{ dosage: string; available: number; lot: number }>("stock")
    .findOne({ dosage });

  if (!row) return;

  const available = Math.min(row.lot, row.available + quantity);

  await db
    .collection("stock")
    .updateOne({ dosage }, { $set: { available, updatedAt: new Date() } });
}

/* ------------------------------------------------------------------ */
/* Registro de Cliques                                                 */
/* ------------------------------------------------------------------ */

/** Grava um novo evento de clique no banco. */
export async function recordClick(data: {
  elementId: string;
  elementText?: string;
  pageUrl: string;
  clientIp?: string;
}) {
  const db = await getMongo();
  if (!db) return;

  await db.collection("clicks").insertOne({
    id: await nextSequence("clicks"),
    elementId: data.elementId,
    elementText: data.elementText ?? null,
    pageUrl: data.pageUrl,
    clientIp: data.clientIp ?? null,
    createdAt: new Date(),
  });
}

/**
 * Retorna o funil de cliques da loja, com totais por página e por elemento.
 * O `pageUrl` é gravado em cada evento para que o painel mostre exatamente
 * onde o cliente clicou, e não apenas o botão que recebeu o clique.
 */
export async function getClickStats() {
  const db = await getMongo();
  if (!db) return { totalClicks: 0, pages: [], elements: [] };

  const [result] = await db
    .collection("clicks")
    .aggregate([
      // Registros antigos podiam guardar a URL completa e os atuais guardam a
      // rota. Normalizamos os dois formatos antes de agrupar, para que
      // `https://dominio/carrinho` e `/carrinho` apareçam como uma só página.
      {
        $set: {
          normalizedPageUrl: {
            $let: {
              vars: { source: { $ifNull: ["$pageUrl", "/"] } },
              in: {
                $let: {
                  vars: {
                    withoutHost: {
                      $cond: [
                        { $regexMatch: { input: "$$source", regex: "^https?://" } },
                        {
                          $ifNull: [
                            {
                              $arrayElemAt: [
                                {
                                  $getField: {
                                    field: "captures",
                                    input: {
                                      $regexFind: {
                                        input: "$$source",
                                        regex: "^https?://[^/]+(/[^?#]*)?",
                                      },
                                    },
                                  },
                                },
                                0,
                              ],
                            },
                            "/",
                          ],
                        },
                        "$$source",
                      ],
                    },
                  },
                  in: {
                    $arrayElemAt: [{ $split: ["$$withoutHost", "?"] }, 0],
                  },
                },
              },
            },
          },
        },
      },
      {
        $facet: {
          pages: [
            {
              $group: {
                _id: "$normalizedPageUrl",
                total: { $sum: 1 },
                elementIds: { $addToSet: "$elementId" },
                lastClick: { $max: "$createdAt" },
              },
            },
            { $sort: { total: -1, lastClick: -1 } },
            {
              $project: {
                _id: 0,
                pageUrl: "$_id",
                total: 1,
                uniqueElements: { $size: "$elementIds" },
                lastClick: 1,
              },
            },
          ],
          elements: [
            {
              $group: {
                _id: { pageUrl: "$normalizedPageUrl", elementId: "$elementId" },
                elementText: { $max: "$elementText" },
                total: { $sum: 1 },
                lastClick: { $max: "$createdAt" },
              },
            },
            { $sort: { total: -1, lastClick: -1 } },
            {
              $project: {
                _id: 0,
                pageUrl: "$_id.pageUrl",
                elementId: "$_id.elementId",
                elementText: 1,
                total: 1,
                lastClick: 1,
              },
            },
          ],
          summary: [{ $count: "totalClicks" }],
        },
      },
    ])
    .toArray();

  return {
    totalClicks: result?.summary?.[0]?.totalClicks ?? 0,
    pages: result?.pages ?? [],
    elements: result?.elements ?? [],
  };
}

/* ------------------------------------------------------------------ */
/* Limite de pedidos por IP                                            */
/* ------------------------------------------------------------------ */

/**
 * Conta quantos pedidos válidos (não cancelados) o IP já registrou. Quando
 * `windowHours` é maior que zero, considera apenas o período recente.
 */
export async function countOrdersByIp(
  clientIp: string,
  windowHours: number
): Promise<number> {
  const db = await getMongo();
  if (!db) return 0;

  const filter: Record<string, unknown> = {
    clientIp,
    status: { $ne: "canceled" },
  };

  if (windowHours > 0) {
    const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);
    filter.createdAt = { $gte: since };
  }

  return db.collection("orders").countDocuments(filter);
}
