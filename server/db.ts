import { and, count, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertOrder,
  InsertUser,
  orders,
  settings,
  stock,
  users,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
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
  /* ---- Rastreamento de conversões ---- */
  // ID do Meta Pixel (Facebook/Instagram), ex.: 1234567890123456
  "metaPixelId",
  // Token da Conversions API do Meta (opcional, envio servidor a servidor)
  "metaCapiToken",
  // ID de métrica do GA4, ex.: G-XXXXXXXXXX
  "ga4MeasurementId",
  // ID de conversão do Google Ads, ex.: AW-123456789
  "googleAdsId",
  // Rótulo da conversão de compra no Google Ads, ex.: AbC-D_efGh
  "googleAdsPurchaseLabel",
  // Google Tag Manager (opcional), ex.: GTM-XXXXXXX
  "gtmId",
  // "1" ativa os disparos; "0" mantém as tags desligadas sem perder os IDs.
  "trackingEnabled",
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];

/** Lê todas as configurações em um objeto simples. */
export async function getSettings(): Promise<Record<string, string>> {
  const db = await getDb();
  if (!db) return {};

  const rows = await db
    .select()
    .from(settings)
    .where(inArray(settings.settingKey, [...SETTING_KEYS]));

  return rows.reduce<Record<string, string>>((acc, row) => {
    acc[row.settingKey] = row.settingValue ?? "";
    return acc;
  }, {});
}

/** Grava (ou atualiza) um conjunto de configurações. */
export async function saveSettings(values: Record<string, string>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  const entries = Object.entries(values).filter(([key]) =>
    (SETTING_KEYS as readonly string[]).includes(key),
  );

  for (const [settingKey, settingValue] of entries) {
    await db
      .insert(settings)
      .values({ settingKey, settingValue })
      .onDuplicateKeyUpdate({ set: { settingValue } });
  }
}

/* ------------------------------------------------------------------ */
/* Pedidos                                                             */
/* ------------------------------------------------------------------ */

export async function createOrder(order: InsertOrder) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  await db.insert(orders).values(order);

  const created = await db
    .select()
    .from(orders)
    .where(eq(orders.reference, order.reference))
    .limit(1);

  return created[0];
}

/**
 * Sequência do código legível do pedido. Usa a quantidade de pedidos já
 * gravados (e não o `id` auto-increment, que pode começar em valores altos),
 * de modo que a numeração fique curta e previsível: TG-000001, TG-000002...
 *
 * A unicidade real é garantida pelo índice único de `reference`: quem chamar
 * esta função deve tratar a colisão tentando a sequência seguinte.
 */
export async function getNextOrderSequence(): Promise<number> {
  const db = await getDb();
  if (!db) return 1;

  const rows = await db.select({ total: count() }).from(orders);
  return Number(rows[0]?.total ?? 0) + 1;
}

/** Busca um pedido pelo id, sem carregar a lista inteira. */
export async function getOrderById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const rows = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  return rows[0];
}

export async function listOrders() {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(orders).orderBy(desc(orders.createdAt));
}

export async function getOrderByReference(reference: string) {
  const db = await getDb();
  if (!db) return undefined;

  const rows = await db
    .select()
    .from(orders)
    .where(eq(orders.reference, reference))
    .limit(1);

  return rows[0];
}

export async function updateOrderStatus(
  id: number,
  status:
    | "pending"
    | "awaiting_confirmation"
    | "card_declined"
    | "paid"
    | "shipped"
    | "canceled",
) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  await db.update(orders).set({ status }).where(eq(orders.id, id));
}

/**
 * Registra que o cliente declarou ter pago. Não confirma o pagamento: apenas
 * sinaliza para o admin conferir no extrato. Só avança a partir de `pending`,
 * para não sobrescrever um pedido já pago, enviado ou cancelado.
 */
export async function claimOrderPayment(reference: string) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  await db
    .update(orders)
    .set({ status: "awaiting_confirmation", paymentClaimedAt: new Date() })
    .where(and(eq(orders.reference, reference), eq(orders.status, "pending")));
}

/**
 * Grava o código Pix de um pedido criado sem ele (caso do cartão recusado que
 * o cliente decide pagar via Pix) e devolve o pedido para `pending`.
 */
export async function setOrderPixPayload(reference: string, pixPayload: string) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  await db
    .update(orders)
    .set({ pixPayload, paymentMethod: "pix", status: "pending" })
    .where(eq(orders.reference, reference));
}

export async function deleteOrder(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  await db.delete(orders).where(eq(orders.id, id));
}

/**
 * Marca que a compra já foi enviada ao Meta pela Conversions API.
 * A escrita só acontece se `capiSentAt` ainda estiver vazio, o que evita
 * duplicar a conversão quando o admin marca o pedido como pago mais de uma vez.
 * Devolve `true` quando esta chamada foi a que registrou o envio.
 */
export async function markCapiSent(id: number): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  const result = await db
    .update(orders)
    .set({ capiSentAt: new Date() })
    .where(and(eq(orders.id, id), isNull(orders.capiSentAt)));

  // O driver mysql2 devolve `affectedRows`; se nada mudou, outro processo já
  // havia enviado a conversão para este pedido.
  const affected = (result as unknown as { affectedRows?: number })?.affectedRows;
  return (affected ?? 0) > 0;
}

/** Registra o momento em que a cobrança Pix foi enviada pelo WhatsApp. */
export async function markChargeSent(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  await db
    .update(orders)
    .set({ chargeSentAt: new Date() })
    .where(eq(orders.id, id));
}

/**
 * Libera a trava da Conversions API quando o envio falhou, permitindo tentar de
 * novo. Sem isso, um erro de rede impediria a conversão para sempre.
 */
export async function clearCapiSent(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  await db.update(orders).set({ capiSentAt: null }).where(eq(orders.id, id));
}

/* ------------------------------------------------------------------ */
/* Estoque promocional por dosagem                                     */
/* ------------------------------------------------------------------ */

/** Lista o estoque de todas as dosagens, em ordem de cadastro. */
export async function listStock() {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(stock).orderBy(stock.id);
}

/** Cria ou atualiza a quantidade disponível de uma dosagem. */
export async function upsertStock(dosage: string, available: number, lot: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  await db
    .insert(stock)
    .values({ dosage, available, lot })
    .onDuplicateKeyUpdate({ set: { available, lot } });
}

/**
 * Baixa `quantity` unidades da dosagem de forma atômica: o UPDATE só afeta a
 * linha quando ainda há saldo suficiente, então duas compras simultâneas não
 * conseguem levar o estoque a um valor negativo.
 *
 * Retorna `true` quando a baixa foi aplicada e `false` quando faltou saldo.
 */
export async function decrementStock(
  dosage: string,
  quantity: number,
): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  const result = await db
    .update(stock)
    .set({ available: sql`${stock.available} - ${quantity}` })
    .where(and(eq(stock.dosage, dosage), gte(stock.available, quantity)));

  // mysql2 devolve `affectedRows` no header do resultado.
  const affected =
    (result as unknown as { rowsAffected?: number })?.rowsAffected ??
    (result as unknown as [{ affectedRows?: number }])[0]?.affectedRows ??
    0;

  return affected > 0;
}

/**
 * Devolve unidades ao estoque (pedido cancelado ou apagado), sem nunca passar
 * do tamanho do lote — caso contrário a barra de progresso da vitrine passaria
 * de 100% e o "restam X de Y" ficaria incoerente.
 */
export async function restoreStock(dosage: string, quantity: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  await db
    .update(stock)
    .set({
      available: sql`LEAST(${stock.lot}, ${stock.available} + ${quantity})`,
    })
    .where(eq(stock.dosage, dosage));
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
  windowHours: number,
): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const filters = [
    eq(orders.clientIp, clientIp),
    sql`${orders.status} <> 'canceled'`,
  ];

  if (windowHours > 0) {
    const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);
    filters.push(gte(orders.createdAt, since));
  }

  const rows = await db
    .select({ total: count() })
    .from(orders)
    .where(and(...filters));

  return Number(rows[0]?.total ?? 0);
}
