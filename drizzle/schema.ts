import {
  decimal,
  int,
  index,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Pedidos enviados pelo checkout da loja.
 * Guarda todos os dados digitados pelo cliente para consulta no painel admin.
 */
export const orders = mysqlTable(
  "orders",
  {
  id: int("id").autoincrement().primaryKey(),
  /** Código legível exibido ao cliente, ex.: TG-000123. */
  reference: varchar("reference", { length: 32 }).notNull().unique(),
  customerName: varchar("customerName", { length: 200 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  cpf: varchar("cpf", { length: 20 }).notNull(),
  phone: varchar("phone", { length: 30 }).notNull(),
  cep: varchar("cep", { length: 12 }).notNull(),
  address: varchar("address", { length: 255 }).notNull(),
  number: varchar("number", { length: 20 }).notNull(),
  complement: varchar("complement", { length: 120 }),
  district: varchar("district", { length: 120 }).notNull(),
  city: varchar("city", { length: 120 }).notNull(),
  state: varchar("state", { length: 4 }).notNull(),
  paymentMethod: mysqlEnum("paymentMethod", ["pix", "card"]).notNull(),
  installments: int("installments").default(1).notNull(),
  /**
   * Dados NÃO sensíveis do cartão, apenas para identificar o pagamento.
   * Número completo, validade e CVV nunca são gravados (regras PCI-DSS).
   */
  cardBrand: varchar("cardBrand", { length: 20 }),
  cardLast4: varchar("cardLast4", { length: 4 }),
  cardHolder: varchar("cardHolder", { length: 120 }),
  /** Total do pedido em reais. */
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  /** Itens do pedido serializados em JSON. */
  items: text("items").notNull(),
  /** Código Pix copia-e-cola gerado no momento do pedido. */
  pixPayload: text("pixPayload"),
  /**
   * `awaiting_confirmation` significa que o cliente clicou em "Já paguei".
   * É um aviso, não uma confirmação: o admin valida no banco e marca `paid`.
   * `card_declined` marca a tentativa de pagamento no cartão que não foi
   * autorizada — o pedido e os dados do cliente ficam salvos para retomada.
   */
  status: mysqlEnum("status", [
    "pending",
    "awaiting_confirmation",
    "card_declined",
    "paid",
    "shipped",
    "canceled",
  ])
    .default("pending")
    .notNull(),
  /** Momento em que o cliente declarou ter pago. */
  paymentClaimedAt: timestamp("paymentClaimedAt"),
  /**
   * Momento em que a compra foi enviada ao Meta pela Conversions API.
   * Funciona como trava: marcar o pedido como pago outra vez não duplica a
   * conversão. O `event_id` enviado é a própria referência do pedido, então o
   * Meta também desduplica o evento do navegador com o do servidor.
   */
  capiSentAt: timestamp("capiSentAt"),
  /** Momento em que a cobrança Pix foi enviada ao cliente pelo WhatsApp. */
  chargeSentAt: timestamp("chargeSentAt"),
  /**
   * IP de origem do pedido, usado para limitar o número de compras por IP.
   * Guardado como texto para aceitar IPv4 e IPv6.
   */
  clientIp: varchar("clientIp", { length: 64 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    // Índices usados pelo limite por IP e pela listagem do painel.
    clientIpIdx: index("idx_orders_clientIp").on(table.clientIp),
    createdAtIdx: index("idx_orders_createdAt").on(table.createdAt),
  }),
);

export type Order = typeof orders.$inferSelect;
export type InsertOrder = typeof orders.$inferInsert;

/**
 * Configurações da loja em pares chave/valor.
 * Guarda a chave Pix, nome do recebedor e cidade usados no BR Code.
 */
export const settings = mysqlTable("settings", {
  id: int("id").autoincrement().primaryKey(),
  settingKey: varchar("settingKey", { length: 64 }).notNull().unique(),
  settingValue: text("settingValue"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Setting = typeof settings.$inferSelect;

/**
 * Estoque promocional por dosagem, controlado no servidor.
 * `available` é a quantidade que ainda pode ser vendida com desconto e `lot` é
 * o tamanho do lote, usado apenas para a barra de progresso na vitrine.
 */
export const stock = mysqlTable("stock", {
  id: int("id").autoincrement().primaryKey(),
  dosage: varchar("dosage", { length: 20 }).notNull().unique(),
  available: int("available").notNull().default(0),
  lot: int("lot").notNull().default(10),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Stock = typeof stock.$inferSelect;

/**
 * Registro de cliques em elementos da interface.
 * Permite saber quais botões e links os clientes estão usando.
 */
export const clicks = mysqlTable(
  "clicks",
  {
    id: int("id").autoincrement().primaryKey(),
    /** Identificador único do elemento clicado (ex: 'buy-now-button'). */
    elementId: varchar("elementId", { length: 128 }).notNull(),
    /** Texto visível no elemento no momento do clique. */
    elementText: text("elementText"),
    /** URL da página onde o clique ocorreu. */
    pageUrl: text("pageUrl").notNull(),
    /** IP do cliente para evitar contagem duplicada excessiva de um mesmo usuário. */
    clientIp: varchar("clientIp", { length: 64 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    elementIdIdx: index("idx_clicks_elementId").on(table.elementId),
    createdAtIdx: index("idx_clicks_createdAt").on(table.createdAt),
  }),
);

export type Click = typeof clicks.$inferSelect;
export type InsertClick = typeof clicks.$inferInsert;
