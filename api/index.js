// server/_core/index.ts
import "dotenv/config";
import express2 from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var AXIOS_TIMEOUT_MS = 3e4;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var OAUTH_STATE_COOKIE = "__Host-oauth_state";
var decodeOAuthState = (state) => {
  let decoded;
  try {
    decoded = atob(state);
  } catch {
    return { redirectUri: "" };
  }
  try {
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed.redirectUri === "string") return parsed;
  } catch {
  }
  return { redirectUri: decoded };
};

// server/_core/oauth.ts
import { parse as parseCookieHeader2 } from "cookie";

// server/db.ts
import { and, count, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";

// drizzle/schema.ts
import {
  decimal,
  int,
  index,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar
} from "drizzle-orm/mysql-core";
var users = mysqlTable("users", {
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
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull()
});
var orders = mysqlTable(
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
      "canceled"
    ]).default("pending").notNull(),
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
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
  },
  (table) => ({
    // Índices usados pelo limite por IP e pela listagem do painel.
    clientIpIdx: index("idx_orders_clientIp").on(table.clientIp),
    createdAtIdx: index("idx_orders_createdAt").on(table.createdAt)
  })
);
var settings = mysqlTable("settings", {
  id: int("id").autoincrement().primaryKey(),
  settingKey: varchar("settingKey", { length: 64 }).notNull().unique(),
  settingValue: text("settingValue"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var stock = mysqlTable("stock", {
  id: int("id").autoincrement().primaryKey(),
  dosage: varchar("dosage", { length: 20 }).notNull().unique(),
  available: int("available").notNull().default(0),
  lot: int("lot").notNull().default(10),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var clicks = mysqlTable(
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
    createdAt: timestamp("createdAt").defaultNow().notNull()
  },
  (table) => ({
    elementIdIdx: index("idx_clicks_elementId").on(table.elementId),
    createdAtIdx: index("idx_clicks_createdAt").on(table.createdAt)
  })
);

// server/_core/env.ts
var ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? ""
};

// server/db.ts
var _db = null;
async function getDb() {
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
async function upsertUser(user) {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }
  try {
    const values = {
      openId: user.openId
    };
    const updateSet = {};
    const textFields = ["name", "email", "loginMethod"];
    const assignNullable = (field2) => {
      const value = user[field2];
      if (value === void 0) return;
      const normalized = value ?? null;
      values[field2] = normalized;
      updateSet[field2] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== void 0) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== void 0) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    if (!values.lastSignedIn) {
      values.lastSignedIn = /* @__PURE__ */ new Date();
    }
    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = /* @__PURE__ */ new Date();
    }
    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return void 0;
  }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
var SETTING_KEYS = [
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
  "trackingEnabled"
];
async function getSettings() {
  const db = await getDb();
  if (!db) return {};
  const rows = await db.select().from(settings).where(inArray(settings.settingKey, [...SETTING_KEYS]));
  return rows.reduce((acc, row) => {
    acc[row.settingKey] = row.settingValue ?? "";
    return acc;
  }, {});
}
async function saveSettings(values) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  const entries = Object.entries(values).filter(
    ([key]) => SETTING_KEYS.includes(key)
  );
  for (const [settingKey, settingValue] of entries) {
    await db.insert(settings).values({ settingKey, settingValue }).onDuplicateKeyUpdate({ set: { settingValue } });
  }
}
async function createOrder(order) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  await db.insert(orders).values(order);
  const created = await db.select().from(orders).where(eq(orders.reference, order.reference)).limit(1);
  return created[0];
}
async function getNextOrderSequence() {
  const db = await getDb();
  if (!db) return 1;
  const rows = await db.select({ total: count() }).from(orders);
  return Number(rows[0]?.total ?? 0) + 1;
}
async function getOrderById(id) {
  const db = await getDb();
  if (!db) return void 0;
  const rows = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  return rows[0];
}
async function listOrders() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(orders).orderBy(desc(orders.createdAt));
}
async function getOrderByReference(reference) {
  const db = await getDb();
  if (!db) return void 0;
  const rows = await db.select().from(orders).where(eq(orders.reference, reference)).limit(1);
  return rows[0];
}
async function updateOrderStatus(id, status) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  await db.update(orders).set({ status }).where(eq(orders.id, id));
}
async function claimOrderPayment(reference) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  await db.update(orders).set({ status: "awaiting_confirmation", paymentClaimedAt: /* @__PURE__ */ new Date() }).where(and(eq(orders.reference, reference), eq(orders.status, "pending")));
}
async function setOrderPixPayload(reference, pixPayload) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  await db.update(orders).set({ pixPayload, paymentMethod: "pix", status: "pending" }).where(eq(orders.reference, reference));
}
async function deleteOrder(id) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  await db.delete(orders).where(eq(orders.id, id));
}
async function markCapiSent(id) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  const result = await db.update(orders).set({ capiSentAt: /* @__PURE__ */ new Date() }).where(and(eq(orders.id, id), isNull(orders.capiSentAt)));
  const affected = result?.affectedRows;
  return (affected ?? 0) > 0;
}
async function markChargeSent(id) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  await db.update(orders).set({ chargeSentAt: /* @__PURE__ */ new Date() }).where(eq(orders.id, id));
}
async function clearCapiSent(id) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  await db.update(orders).set({ capiSentAt: null }).where(eq(orders.id, id));
}
async function listStock() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(stock).orderBy(stock.id);
}
async function upsertStock(dosage, available, lot) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  await db.insert(stock).values({ dosage, available, lot }).onDuplicateKeyUpdate({ set: { available, lot } });
}
async function decrementStock(dosage, quantity) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  const result = await db.update(stock).set({ available: sql`${stock.available} - ${quantity}` }).where(and(eq(stock.dosage, dosage), gte(stock.available, quantity)));
  const affected = result?.rowsAffected ?? result[0]?.affectedRows ?? 0;
  return affected > 0;
}
async function restoreStock(dosage, quantity) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  await db.update(stock).set({
    available: sql`LEAST(${stock.lot}, ${stock.available} + ${quantity})`
  }).where(eq(stock.dosage, dosage));
}
async function recordClick(data) {
  const db = await getDb();
  if (!db) return;
  await db.insert(clicks).values({
    elementId: data.elementId,
    elementText: data.elementText ?? null,
    pageUrl: data.pageUrl,
    clientIp: data.clientIp ?? null
  });
}
async function getClickStats() {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    elementId: clicks.elementId,
    total: count(),
    lastClick: sql`MAX(${clicks.createdAt})`
  }).from(clicks).groupBy(clicks.elementId).orderBy(desc(count()));
}
async function countOrdersByIp(clientIp, windowHours) {
  const db = await getDb();
  if (!db) return 0;
  const filters = [
    eq(orders.clientIp, clientIp),
    sql`${orders.status} <> 'canceled'`
  ];
  if (windowHours > 0) {
    const since = new Date(Date.now() - windowHours * 60 * 60 * 1e3);
    filters.push(gte(orders.createdAt, since));
  }
  const rows = await db.select({ total: count() }).from(orders).where(and(...filters));
  return Number(rows[0]?.total ?? 0);
}

// server/_core/cookies.ts
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getSessionCookieOptions(req) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: isSecureRequest(req)
  };
}

// shared/_core/errors.ts
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// server/_core/sdk.ts
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";
var isNonEmptyString = (value) => typeof value === "string" && value.length > 0;
var EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
var GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
var GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
var OAuthService = class {
  constructor(client) {
    this.client = client;
    console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
    if (!ENV.oAuthServerUrl) {
      console.error(
        "[OAuth] ERROR: OAUTH_SERVER_URL is not configured! Set OAUTH_SERVER_URL environment variable."
      );
    }
  }
  decodeState(state) {
    return decodeOAuthState(state).redirectUri;
  }
  async getTokenByCode(code, state) {
    const payload = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state)
    };
    const { data } = await this.client.post(
      EXCHANGE_TOKEN_PATH,
      payload
    );
    return data;
  }
  async getUserInfoByToken(token) {
    const { data } = await this.client.post(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken
      }
    );
    return data;
  }
};
var createOAuthHttpClient = () => axios.create({
  baseURL: ENV.oAuthServerUrl,
  timeout: AXIOS_TIMEOUT_MS
});
var SDKServer = class {
  client;
  oauthService;
  constructor(client = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }
  deriveLoginMethod(platforms, fallback) {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set(
      platforms.filter((p) => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }
  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(code, state) {
    return this.oauthService.getTokenByCode(code, state);
  }
  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken) {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken
    });
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  parseCookies(cookieHeader) {
    if (!cookieHeader) {
      return /* @__PURE__ */ new Map();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }
  getSessionSecret() {
    const secret = ENV.cookieSecret;
    return new TextEncoder().encode(secret);
  }
  /**
   * Create a session token for a Manus user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(openId, options = {}) {
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name || ""
      },
      options
    );
  }
  async signSession(payload, options = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
    const secretKey = this.getSessionSecret();
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name
    }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey);
  }
  async verifySession(cookieValue) {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"]
      });
      const { openId, appId, name } = payload;
      if (!isNonEmptyString(openId) || !isNonEmptyString(appId) || !isNonEmptyString(name)) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }
      return {
        openId,
        appId,
        name
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }
  async getUserInfoWithJwt(jwtToken) {
    const payload = {
      jwtToken,
      projectId: ENV.appId
    };
    const { data } = await this.client.post(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  async authenticateRequest(req) {
    const cookies = this.parseCookies(req.headers.cookie);
    let sessionToken = cookies.get(COOKIE_NAME);
    if (!sessionToken) {
      const authHeader = req.headers.authorization;
      if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
        sessionToken = authHeader.slice(7);
      }
    }
    const session = await this.verifySession(sessionToken);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }
    if (session.openId.startsWith(CRON_OPEN_ID_PREFIX)) {
      const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
      const taskUid = userInfo.taskUid ?? null;
      if (!taskUid) {
        throw ForbiddenError("Cron session missing task_uid");
      }
      return buildCronUser(userInfo);
    }
    const sessionUserId = session.openId;
    const signedInAt = /* @__PURE__ */ new Date();
    let user = await getUserByOpenId(sessionUserId);
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
        await upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt
        });
        user = await getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }
    if (!user) {
      throw ForbiddenError("User not found");
    }
    await upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt
    });
    return user;
  }
};
var CRON_OPEN_ID_PREFIX = "cron_";
function buildCronUser(userInfo) {
  const now = /* @__PURE__ */ new Date();
  return {
    id: -1,
    openId: userInfo.openId,
    name: userInfo.name || "Manus Scheduled Task",
    email: null,
    loginMethod: null,
    role: "user",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
    taskUid: userInfo.taskUid ?? void 0,
    isCron: true
  };
}
var sdk = new SDKServer();

// server/_core/oauth.ts
function getQueryParam(req, key) {
  const value = req.query[key];
  return typeof value === "string" ? value : void 0;
}
function registerOAuthRoutes(app) {
  app.get("/api/oauth/callback", async (req, res) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }
    const { nonce } = decodeOAuthState(state);
    const expectedNonce = parseCookieHeader2(req.headers.cookie ?? "")[OAUTH_STATE_COOKIE];
    if (!nonce || nonce !== expectedNonce) {
      res.status(403).json({ error: "invalid oauth state" });
      return;
    }
    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/", secure: true, sameSite: "none" });
    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }
      await upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}

// server/_core/storageProxy.ts
function registerStorageProxy(app) {
  app.get("/manus-storage/*", async (req, res) => {
    const key = req.params[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }
    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }
    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/"
      );
      forgeUrl.searchParams.set("path", key);
      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` }
      });
      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }
      const { url } = await forgeResp.json();
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }
      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
import { TRPCError } from "@trpc/server";
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString2 = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString2(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString2(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure;

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/routers/store.ts
import { TRPCError as TRPCError3 } from "@trpc/server";
import { z as z2 } from "zod";

// shared/pix.ts
function field(id, value) {
  const size = value.length.toString().padStart(2, "0");
  return `${id}${size}${value}`;
}
function sanitize(text2, maxLength) {
  return text2.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9 .,\-]/g, "").trim().slice(0, maxLength).toUpperCase();
}
function sanitizeTxid(text2) {
  const cleaned = text2.replace(/[^A-Za-z0-9]/g, "").slice(0, 25);
  return cleaned.length > 0 ? cleaned : "***";
}
function crc16(payload) {
  let crc = 65535;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 32768 ? (crc << 1 ^ 4129) & 65535 : crc << 1 & 65535;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}
function buildPixPayload({
  key,
  merchantName,
  merchantCity,
  amount,
  txid
}) {
  const trimmedKey = key.trim();
  if (!trimmedKey) {
    throw new Error("Chave Pix n\xE3o configurada");
  }
  const merchantAccount = field("00", "br.gov.bcb.pix") + field("01", trimmedKey);
  const additionalData = field("05", sanitizeTxid(txid ?? ""));
  let payload = field("00", "01") + // Payload Format Indicator
  field("26", merchantAccount) + // Merchant Account Information - Pix
  field("52", "0000") + // Merchant Category Code
  field("53", "986");
  if (amount > 0) {
    payload += field("54", amount.toFixed(2));
  }
  payload += field("58", "BR") + field("59", sanitize(merchantName, 25) || "RECEBEDOR") + field("60", sanitize(merchantCity, 15) || "SAO PAULO") + field("62", additionalData);
  const withCrcId = `${payload}6304`;
  return `${withCrcId}${crc16(withCrcId)}`;
}

// server/metaCapi.ts
import { createHash } from "node:crypto";
var GRAPH_VERSION = "v21.0";
function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
function hashed(value) {
  const normalized = (value ?? "").trim().toLowerCase();
  if (!normalized) return void 0;
  return sha256(normalized);
}
function hashedDigits(value, prefix = "") {
  const digits = (value ?? "").replace(/\D/g, "");
  if (!digits) return void 0;
  return sha256(`${prefix}${digits}`);
}
function hashedPhone(value) {
  const digits = (value ?? "").replace(/\D/g, "");
  if (digits.length < 10) return void 0;
  const withCountry = digits.startsWith("55") ? digits : `55${digits}`;
  return sha256(withCountry);
}
function splitName(fullName) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return {};
  if (parts.length === 1) return { first: parts[0] };
  return { first: parts[0], last: parts[parts.length - 1] };
}
function buildPurchasePayload(order, config) {
  const { first, last } = splitName(order.customerName);
  const userData = {
    em: hashed(order.email) ? [hashed(order.email)] : void 0,
    ph: hashedPhone(order.phone) ? [hashedPhone(order.phone)] : void 0,
    fn: hashed(first) ? [hashed(first)] : void 0,
    ln: hashed(last) ? [hashed(last)] : void 0,
    ct: hashed(order.city.replace(/\s+/g, "")) ? [hashed(order.city.replace(/\s+/g, ""))] : void 0,
    st: hashed(order.state) ? [hashed(order.state)] : void 0,
    zp: hashedDigits(order.cep) ? [hashedDigits(order.cep)] : void 0,
    country: [sha256("br")],
    // CPF entra como identificador externo, o campo previsto para documentos.
    external_id: hashedDigits(order.cpf) ? [hashedDigits(order.cpf)] : void 0,
    client_ip_address: order.clientIp || void 0
  };
  for (const key of Object.keys(userData)) {
    if (userData[key] === void 0) delete userData[key];
  }
  const body = {
    data: [
      {
        event_name: "Purchase",
        event_time: order.eventTime ?? Math.floor(Date.now() / 1e3),
        // Mesmo id usado pelo pixel no navegador → o Meta desduplica.
        event_id: order.reference,
        action_source: "website",
        event_source_url: config.sourceUrl || void 0,
        user_data: userData,
        custom_data: {
          currency: "BRL",
          value: Number(order.total.toFixed(2)),
          order_id: order.reference,
          content_type: "product",
          contents: order.contents.map((item) => ({
            id: item.id,
            quantity: item.quantity,
            item_price: Number(item.price.toFixed(2))
          }))
        }
      }
    ]
  };
  if (config.testEventCode) body.test_event_code = config.testEventCode;
  return body;
}
async function sendPurchaseToMeta(order, config) {
  if (!config.pixelId || !config.accessToken) {
    return { sent: false, reason: "Pixel ID ou token da Conversions API ausente" };
  }
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${config.pixelId}/events?access_token=${encodeURIComponent(config.accessToken)}`;
  const payload = buildPurchasePayload(order, config);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8e3);
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    clearTimeout(timeout);
    const text2 = await response.text();
    if (!response.ok) {
      return {
        sent: false,
        reason: `Meta respondeu ${response.status}: ${text2.slice(0, 300)}`
      };
    }
    let received = 1;
    try {
      const parsed = JSON.parse(text2);
      received = parsed.events_received ?? 1;
    } catch {
    }
    return { sent: true, eventsReceived: received };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Falha ao contatar o Meta";
    return { sent: false, reason };
  }
}

// server/routers/store.ts
var orderItemSchema = z2.object({
  sku: z2.string(),
  name: z2.string(),
  dosage: z2.string(),
  quantity: z2.number().int().min(1).max(20),
  unitPrice: z2.number().min(0),
  listPrice: z2.number().min(0),
  image: z2.string().optional()
});
var checkoutSchema = z2.object({
  customerName: z2.string().min(3).max(200),
  email: z2.string().email().max(320),
  cpf: z2.string().min(11).max(20),
  phone: z2.string().min(8).max(30),
  cep: z2.string().min(8).max(12),
  address: z2.string().min(3).max(255),
  number: z2.string().min(1).max(20),
  complement: z2.string().max(120).optional(),
  district: z2.string().min(2).max(120),
  city: z2.string().min(2).max(120),
  state: z2.string().min(2).max(4),
  paymentMethod: z2.enum(["pix", "card"]),
  installments: z2.number().int().min(1).max(3).default(1),
  /**
   * Dados NÃO sensíveis do cartão. O servidor recusa qualquer tentativa de
   * enviar número completo, validade ou CVV: só bandeira, 4 últimos e nome.
   */
  cardBrand: z2.string().max(20).optional(),
  cardLast4: z2.string().regex(/^\d{4}$/, "Informe apenas os 4 \xFAltimos d\xEDgitos").optional(),
  cardHolder: z2.string().max(120).optional(),
  items: z2.array(orderItemSchema).min(1)
});
function calculateTotal(items) {
  const cents = items.reduce(
    (sum, item) => sum + Math.round(item.unitPrice * 100) * item.quantity,
    0
  );
  return cents / 100;
}
function parseItems(raw, reference) {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error(`[Pedido ${reference}] Itens ileg\xEDveis:`, error);
    return [];
  }
}
var DEFAULT_MAX_ORDERS_PER_IP = 2;
var DEFAULT_IP_WINDOW_HOURS = 24;
async function sendOrderConversion(orderId) {
  try {
    const [order, settings2] = await Promise.all([
      getOrderById(orderId),
      getSettings()
    ]);
    if (!order) return { sent: false, reason: "Pedido n\xE3o encontrado" };
    const trackingOn = (settings2.trackingEnabled ?? "1") !== "0";
    if (!trackingOn) {
      return { sent: false, reason: "Rastreamento desativado no painel" };
    }
    const pixelId = settings2.metaPixelId ?? "";
    const accessToken = settings2.metaCapiToken ?? "";
    if (!pixelId || !accessToken) {
      return {
        sent: false,
        reason: "Informe o Meta Pixel ID e o token da Conversions API"
      };
    }
    const first = await markCapiSent(orderId);
    if (!first) {
      return { sent: false, reason: "Convers\xE3o j\xE1 enviada anteriormente" };
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
        contents: items.map((item) => ({
          id: `${item.sku}-${item.dosage}`,
          quantity: item.quantity,
          price: item.unitPrice
        }))
      },
      {
        pixelId,
        accessToken,
        testEventCode: settings2.metaTestEventCode || void 0
      }
    );
    if (!result.sent) {
      await clearCapiSent(orderId);
      console.error(`[CAPI ${order.reference}] ${result.reason}`);
      return { sent: false, reason: result.reason };
    }
    return { sent: true };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Falha ao enviar convers\xE3o";
    console.error("[CAPI] Erro inesperado:", error);
    return { sent: false, reason };
  }
}
function resolveClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const first = typeof raw === "string" ? raw.split(",")[0]?.trim() : void 0;
  const candidate = first || (typeof req.headers["x-real-ip"] === "string" ? req.headers["x-real-ip"] : void 0) || req.ip || req.socket?.remoteAddress || "";
  return candidate.replace(/^::ffff:/, "").slice(0, 64) || "desconhecido";
}
var storeRouter = router({
  /** Consulta de endereço por CEP usando a API pública ViaCEP. */
  lookupCep: publicProcedure.input(z2.object({ cep: z2.string() })).query(async ({ input }) => {
    const digits = input.cep.replace(/\D/g, "");
    if (digits.length !== 8) {
      throw new TRPCError3({
        code: "BAD_REQUEST",
        message: "CEP deve conter 8 d\xEDgitos"
      });
    }
    const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
    if (!response.ok) {
      throw new TRPCError3({
        code: "INTERNAL_SERVER_ERROR",
        message: "N\xE3o foi poss\xEDvel consultar o CEP agora"
      });
    }
    const data = await response.json();
    if (data.erro) {
      throw new TRPCError3({ code: "NOT_FOUND", message: "CEP n\xE3o encontrado" });
    }
    return {
      cep: digits.replace(/(\d{5})(\d{3})/, "$1-$2"),
      address: data.logradouro ?? "",
      district: data.bairro ?? "",
      city: data.localidade ?? "",
      state: data.uf ?? ""
    };
  }),
  /** Informa ao checkout se o Pix já está configurado pelo administrador. */
  pixStatus: publicProcedure.query(async () => {
    const settings2 = await getSettings();
    return { configured: Boolean(settings2.pixKey) };
  }),
  /**
   * IDs de rastreamento visíveis ao navegador. Só devolve os identificadores
   * públicos (que já ficariam expostos no HTML de qualquer site) — o token da
   * Conversions API nunca sai do servidor.
   */
  tracking: publicProcedure.query(async () => {
    const settings2 = await getSettings();
    const enabled = (settings2.trackingEnabled ?? "1") !== "0";
    return {
      enabled,
      metaPixelId: enabled ? settings2.metaPixelId ?? "" : "",
      ga4MeasurementId: enabled ? settings2.ga4MeasurementId ?? "" : "",
      googleAdsId: enabled ? settings2.googleAdsId ?? "" : "",
      googleAdsPurchaseLabel: enabled ? settings2.googleAdsPurchaseLabel ?? "" : "",
      gtmId: enabled ? settings2.gtmId ?? "" : ""
    };
  }),
  /**
   * Disponibilidade pública por dosagem, usada na vitrine e no checkout.
   * Sai do banco, então o número mostrado é o mesmo que o servidor valida.
   */
  availability: publicProcedure.query(async () => {
    const [rows, settings2] = await Promise.all([listStock(), getSettings()]);
    return {
      maxPerOrder: Number(settings2.maxOrdersPerIp || DEFAULT_MAX_ORDERS_PER_IP),
      stock: rows.map((row) => ({
        dosage: row.dosage,
        available: row.available,
        lot: row.lot
      }))
    };
  }),
  /** Registra um clique vindo do frontend. Procedimento público. */
  trackClick: publicProcedure.input(
    z2.object({
      elementId: z2.string().max(128),
      elementText: z2.string().max(500).optional(),
      pageUrl: z2.string().max(500)
    })
  ).mutation(async ({ input, ctx }) => {
    await recordClick({
      ...input,
      clientIp: ctx.req.ip
    });
    return { success: true };
  }),
  /** Registra o pedido e devolve o Pix copia-e-cola quando aplicável. */
  createOrder: publicProcedure.input(checkoutSchema).mutation(async ({ input, ctx }) => {
    const clientIp = resolveClientIp(ctx.req);
    const settings2 = await getSettings();
    const maxPerIp = Number(
      settings2.maxOrdersPerIp || DEFAULT_MAX_ORDERS_PER_IP
    );
    const windowHours = Number(
      settings2.ipWindowHours ?? DEFAULT_IP_WINDOW_HOURS
    );
    if (maxPerIp > 0) {
      const already = await countOrdersByIp(clientIp, windowHours);
      if (already >= maxPerIp) {
        throw new TRPCError3({
          code: "TOO_MANY_REQUESTS",
          message: maxPerIp === 1 ? "Cada cliente pode fazer apenas 1 pedido nesta promo\xE7\xE3o. Fale com o atendimento para liberar uma nova compra." : `Cada cliente pode fazer at\xE9 ${maxPerIp} pedidos nesta promo\xE7\xE3o. Fale com o atendimento para liberar uma nova compra.`
        });
      }
    }
    const requested = /* @__PURE__ */ new Map();
    for (const item of input.items) {
      requested.set(
        item.dosage,
        (requested.get(item.dosage) ?? 0) + item.quantity
      );
    }
    const stockRows = await listStock();
    const stockByDosage = new Map(stockRows.map((row) => [row.dosage, row]));
    for (const [dosage, quantity] of Array.from(requested.entries())) {
      const row = stockByDosage.get(dosage);
      if (!row) continue;
      if (row.available < quantity) {
        throw new TRPCError3({
          code: "PRECONDITION_FAILED",
          message: row.available === 0 ? `A dosagem ${dosage} est\xE1 esgotada nesta promo\xE7\xE3o.` : `Restam apenas ${row.available} unidade(s) de ${dosage} nesta promo\xE7\xE3o. Ajuste a quantidade para continuar.`
        });
      }
    }
    const taken = [];
    for (const [dosage, quantity] of Array.from(requested.entries())) {
      if (!stockByDosage.has(dosage)) continue;
      const ok = await decrementStock(dosage, quantity);
      if (!ok) {
        for (const done of taken) {
          await restoreStock(done.dosage, done.quantity);
        }
        throw new TRPCError3({
          code: "PRECONDITION_FAILED",
          message: `A dosagem ${dosage} acabou de esgotar nesta promo\xE7\xE3o. Recarregue a p\xE1gina para ver as op\xE7\xF5es dispon\xEDveis.`
        });
      }
      taken.push({ dosage, quantity });
    }
    const total = calculateTotal(input.items);
    if (input.paymentMethod === "pix" && !settings2.pixKey) {
      for (const done of taken) {
        await restoreStock(done.dosage, done.quantity);
      }
      throw new TRPCError3({
        code: "PRECONDITION_FAILED",
        message: "A chave Pix ainda n\xE3o foi configurada pela loja. Escolha cart\xE3o ou tente novamente mais tarde."
      });
    }
    const baseSequence = await getNextOrderSequence();
    let reference = "";
    let pixPayload = null;
    let order;
    let lastError = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      reference = `TG-${(baseSequence + attempt).toString().padStart(6, "0")}`;
      pixPayload = input.paymentMethod === "pix" ? buildPixPayload({
        key: settings2.pixKey,
        merchantName: settings2.pixReceiverName || "LOJA TG",
        merchantCity: settings2.pixCity || "SAO PAULO",
        amount: total,
        txid: reference
      }) : null;
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
          cardBrand: input.paymentMethod === "card" ? input.cardBrand ?? null : null,
          cardLast4: input.paymentMethod === "card" ? input.cardLast4 ?? null : null,
          cardHolder: input.paymentMethod === "card" ? input.cardHolder ?? null : null,
          total: total.toFixed(2),
          items: JSON.stringify(input.items),
          pixPayload,
          // Cartão não é autorizado por este site (nenhum processador
          // conectado): o pedido fica gravado com a tentativa recusada.
          status: input.paymentMethod === "card" ? "card_declined" : "pending",
          clientIp
        });
        break;
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : "";
        if (!/duplicate|ER_DUP_ENTRY/i.test(message)) break;
      }
    }
    if (!order) {
      for (const done of taken) {
        await restoreStock(done.dosage, done.quantity);
      }
      console.error("[Pedido] Falha ao gravar o pedido:", lastError);
      throw new TRPCError3({
        code: "INTERNAL_SERVER_ERROR",
        message: "N\xE3o foi poss\xEDvel registrar seu pedido agora. Tente novamente em instantes."
      });
    }
    try {
      const itemsSummary = input.items.map((item) => `${item.quantity}x ${item.dosage}`).join(", ");
      await notifyOwner({
        title: `${input.paymentMethod === "card" ? "Cart\xE3o recusado" : "Novo pedido"} ${reference} \u2014 ${total.toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL"
        })}`,
        content: [
          `Cliente: ${input.customerName}`,
          `Contato: ${input.phone} \xB7 ${input.email}`,
          `CPF: ${input.cpf}`,
          `Itens: ${itemsSummary}`,
          `Pagamento: ${input.paymentMethod === "pix" ? "Pix" : `Cart\xE3o N\xC3O autorizado \u2014 ${input.cardBrand ?? ""} ****${input.cardLast4 ?? "----"} em ${input.installments}x`}`,
          `Entrega: ${input.address}, ${input.number}${input.complement ? ` (${input.complement})` : ""} \u2014 ${input.district}, ${input.city}/${input.state.toUpperCase()} \u2014 CEP ${input.cep}`
        ].join("\n")
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
      declined: input.paymentMethod === "card"
    };
  }),
  /** Consulta pública de um pedido pela referência (tela de confirmação). */
  getOrder: publicProcedure.input(z2.object({ reference: z2.string().min(3) })).query(async ({ input }) => {
    const order = await getOrderByReference(input.reference);
    if (!order) {
      throw new TRPCError3({ code: "NOT_FOUND", message: "Pedido n\xE3o encontrado" });
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
      items: parseItems(order.items, order.reference)
    };
  }),
  /**
   * Cliente declara que pagou o Pix. Marca o pedido como
   * "aguardando confirmação" e avisa o dono; a baixa efetiva é manual.
   */
  claimPayment: publicProcedure.input(z2.object({ reference: z2.string().min(3).max(32) })).mutation(async ({ input }) => {
    const order = await getOrderByReference(input.reference);
    if (!order) {
      throw new TRPCError3({
        code: "NOT_FOUND",
        message: "Pedido n\xE3o encontrado"
      });
    }
    if (order.status === "card_declined") {
      throw new TRPCError3({
        code: "PRECONDITION_FAILED",
        message: "Gere o Pix deste pedido antes de informar o pagamento."
      });
    }
    if (order.status === "canceled") {
      throw new TRPCError3({
        code: "PRECONDITION_FAILED",
        message: "Este pedido foi cancelado. Fa\xE7a um novo pedido para continuar."
      });
    }
    if (order.status !== "pending") {
      return { status: order.status };
    }
    await claimOrderPayment(input.reference);
    try {
      await notifyOwner({
        title: `Pagamento informado \u2014 ${order.reference}`,
        content: [
          `${order.customerName} informou que pagou o Pix.`,
          `Valor: ${Number(order.total).toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL"
          })}`,
          `Contato: ${order.phone} \xB7 ${order.email}`,
          "Confirme o recebimento no seu banco e marque o pedido como Pago no painel."
        ].join("\n")
      });
    } catch (error) {
      console.error("[Pedido] Falha ao notificar aviso de pagamento:", error);
    }
    return { status: "awaiting_confirmation" };
  }),
  /**
   * Converte um pedido recusado no cartão para pagamento via Pix, reaproveitando
   * os dados já informados pelo cliente (nada é digitado de novo).
   */
  switchToPix: publicProcedure.input(z2.object({ reference: z2.string().min(3).max(32) })).mutation(async ({ input }) => {
    const order = await getOrderByReference(input.reference);
    if (!order) {
      throw new TRPCError3({
        code: "NOT_FOUND",
        message: "Pedido n\xE3o encontrado"
      });
    }
    if (order.pixPayload) {
      return { pixPayload: order.pixPayload };
    }
    if (order.status === "paid" || order.status === "shipped") {
      throw new TRPCError3({
        code: "PRECONDITION_FAILED",
        message: "Este pedido j\xE1 foi pago."
      });
    }
    if (order.status === "canceled") {
      throw new TRPCError3({
        code: "PRECONDITION_FAILED",
        message: "Este pedido foi cancelado. Fa\xE7a um novo pedido para pagar com Pix."
      });
    }
    const settings2 = await getSettings();
    if (!settings2.pixKey) {
      throw new TRPCError3({
        code: "PRECONDITION_FAILED",
        message: "A chave Pix ainda n\xE3o foi configurada pela loja. Entre em contato para concluir o pagamento."
      });
    }
    const pixPayload = buildPixPayload({
      key: settings2.pixKey,
      merchantName: settings2.pixReceiverName || "LOJA TG",
      merchantCity: settings2.pixCity || "SAO PAULO",
      amount: Number(order.total),
      txid: order.reference
    });
    await setOrderPixPayload(order.reference, pixPayload);
    return { pixPayload };
  }),
  admin: router({
    /** Estatísticas de cliques para o dashboard. */
    clickStats: adminProcedure.query(async () => {
      return getClickStats();
    }),
    /** Lista completa de pedidos com todos os dados informados pelo cliente. */
    orders: adminProcedure.query(async () => {
      const rows = await listOrders();
      return rows.map((order) => ({
        ...order,
        total: Number(order.total),
        items: parseItems(order.items, order.reference)
      }));
    }),
    settings: adminProcedure.query(async () => {
      const settings2 = await getSettings();
      return {
        pixKey: settings2.pixKey ?? "",
        pixKeyType: settings2.pixKeyType ?? "aleatoria",
        pixReceiverName: settings2.pixReceiverName ?? "",
        pixCity: settings2.pixCity ?? "",
        storeWhatsapp: settings2.storeWhatsapp ?? "",
        maxOrdersPerIp: Number(
          settings2.maxOrdersPerIp || DEFAULT_MAX_ORDERS_PER_IP
        ),
        ipWindowHours: Number(settings2.ipWindowHours ?? DEFAULT_IP_WINDOW_HOURS),
        /* Rastreamento de conversões */
        trackingEnabled: (settings2.trackingEnabled ?? "1") !== "0",
        metaPixelId: settings2.metaPixelId ?? "",
        metaCapiToken: settings2.metaCapiToken ?? "",
        metaTestEventCode: settings2.metaTestEventCode ?? "",
        ga4MeasurementId: settings2.ga4MeasurementId ?? "",
        googleAdsId: settings2.googleAdsId ?? "",
        googleAdsPurchaseLabel: settings2.googleAdsPurchaseLabel ?? "",
        gtmId: settings2.gtmId ?? ""
      };
    }),
    saveSettings: adminProcedure.input(
      z2.object({
        pixKey: z2.string().max(200),
        pixKeyType: z2.enum(["cpf", "cnpj", "email", "telefone", "aleatoria"]),
        pixReceiverName: z2.string().max(100),
        pixCity: z2.string().max(60),
        storeWhatsapp: z2.string().max(30).optional(),
        /** 0 desativa o limite por IP. */
        maxOrdersPerIp: z2.number().int().min(0).max(50),
        /** 0 aplica o limite sem janela de tempo (vale para sempre). */
        ipWindowHours: z2.number().int().min(0).max(8760),
        /* ---- Rastreamento de conversões ---- */
        trackingEnabled: z2.boolean().default(true),
        /** Meta Pixel: 15 ou 16 dígitos. */
        metaPixelId: z2.string().trim().regex(/^\d{15,16}$/, "O ID do Meta Pixel tem 15 ou 16 d\xEDgitos").or(z2.literal("")).default(""),
        metaCapiToken: z2.string().trim().max(400).default(""),
        /** Código TEST do Events Manager, usado só durante a validação. */
        metaTestEventCode: z2.string().trim().max(40).default(""),
        /** GA4: formato G-XXXXXXXXXX. */
        ga4MeasurementId: z2.string().trim().regex(/^G-[A-Z0-9]{6,12}$/i, "O ID do GA4 come\xE7a com G-").or(z2.literal("")).default(""),
        /** Google Ads: formato AW-123456789. */
        googleAdsId: z2.string().trim().regex(/^AW-\d{9,12}$/i, "O ID do Google Ads come\xE7a com AW-").or(z2.literal("")).default(""),
        googleAdsPurchaseLabel: z2.string().trim().max(60).default(""),
        /** GTM: formato GTM-XXXXXXX. */
        gtmId: z2.string().trim().regex(/^GTM-[A-Z0-9]{5,10}$/i, "O ID do GTM come\xE7a com GTM-").or(z2.literal("")).default("")
      })
    ).mutation(async ({ input }) => {
      if (input.pixKey.trim()) {
        buildPixPayload({
          key: input.pixKey,
          merchantName: input.pixReceiverName || "LOJA",
          merchantCity: input.pixCity || "SAO PAULO",
          amount: 1,
          txid: "TESTE"
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
        gtmId: input.gtmId.toUpperCase()
      });
      return { success: true };
    }),
    /** Estoque atual de cada dosagem, para edição no painel. */
    stock: adminProcedure.query(async () => {
      const rows = await listStock();
      return rows.map((row) => ({
        dosage: row.dosage,
        available: row.available,
        lot: row.lot
      }));
    }),
    saveStock: adminProcedure.input(
      z2.object({
        items: z2.array(
          z2.object({
            dosage: z2.string().min(1).max(20),
            available: z2.number().int().min(0).max(9999),
            lot: z2.number().int().min(1).max(9999)
          })
        ).min(1)
      })
    ).mutation(async ({ input }) => {
      for (const item of input.items) {
        await upsertStock(
          item.dosage,
          Math.min(item.available, item.lot),
          item.lot
        );
      }
      return { ok: true };
    }),
    updateStatus: adminProcedure.input(
      z2.object({
        id: z2.number().int(),
        status: z2.enum([
          "pending",
          "awaiting_confirmation",
          "card_declined",
          "paid",
          "shipped",
          "canceled"
        ])
      })
    ).mutation(async ({ input }) => {
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
      let capi;
      if (input.status === "paid") {
        capi = await sendOrderConversion(input.id);
      }
      return { success: true, capi };
    }),
    deleteOrder: adminProcedure.input(z2.object({ id: z2.number().int() })).mutation(async ({ input }) => {
      const order = await getOrderById(input.id);
      if (order && order.status !== "canceled") {
        const items = parseItems(order.items, order.reference);
        for (const item of items) {
          await restoreStock(item.dosage, item.quantity);
        }
      }
      await deleteOrder(input.id);
      return { success: true };
    }),
    /**
     * Monta o link do WhatsApp com a cobrança Pix pronta e registra o envio.
     * O admin clica uma vez no painel: o texto já vai com o valor, a referência
     * do pedido e o código copia-e-cola, sem precisar montar nada à mão.
     */
    whatsappCharge: adminProcedure.input(z2.object({ id: z2.number().int() })).mutation(async ({ input }) => {
      const order = await getOrderById(input.id);
      if (!order) {
        throw new TRPCError3({
          code: "NOT_FOUND",
          message: "Pedido n\xE3o encontrado"
        });
      }
      let pixPayload = order.pixPayload ?? "";
      if (!pixPayload) {
        const settings2 = await getSettings();
        const pixKey = settings2.pixKey?.trim();
        if (!pixKey) {
          throw new TRPCError3({
            code: "PRECONDITION_FAILED",
            message: "Cadastre a chave Pix antes de enviar a cobran\xE7a"
          });
        }
        pixPayload = buildPixPayload({
          key: pixKey,
          merchantName: settings2.pixReceiverName || "LOJA",
          merchantCity: settings2.pixCity || "SAO PAULO",
          amount: Number(order.total),
          txid: order.reference.replace(/[^A-Za-z0-9]/g, "").slice(0, 25)
        });
        await setOrderPixPayload(order.reference, pixPayload);
      }
      const total = Number(order.total).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL"
      });
      const firstName = order.customerName.trim().split(/\s+/)[0] ?? "";
      const items = parseItems(order.items, order.reference);
      const itemsText = items.map((item) => `\u2022 ${item.quantity}x ${item.name} (${item.dosage})`).join("\n");
      const message = [
        `Ol\xE1, ${firstName}! Aqui \xE9 da farm\xE1cia.`,
        "",
        `Sobre o seu pedido *${order.reference}*:`,
        itemsText,
        "",
        `Valor total: *${total}* (frete gr\xE1tis)`,
        "",
        "Para concluir, pague com o Pix copia e cola abaixo. Assim que o pagamento cair, seu pedido \xE9 liberado para envio.",
        "",
        "C\xF3digo Pix copia e cola:",
        pixPayload
      ].join("\n");
      const digits = order.phone.replace(/\D/g, "");
      const phone = digits.startsWith("55") ? digits : `55${digits}`;
      if (digits.length < 10) {
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "O telefone do cliente est\xE1 incompleto"
        });
      }
      await markChargeSent(order.id);
      return {
        url: `https://wa.me/${phone}?text=${encodeURIComponent(message)}`,
        phone,
        pixPayload
      };
    })
  })
});

// server/routers.ts
var appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true
      };
    })
  }),
  store: storeRouter
});

// server/_core/context.ts
async function createContext(opts) {
  let user = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    user = null;
  }
  return {
    req: opts.req,
    res: opts.res,
    user
  };
}

// server/_core/vite.ts
import express from "express";
import fs2 from "fs";
import { nanoid } from "nanoid";
import path2 from "path";
import { createServer as createViteServer } from "vite";

// vite.config.ts
import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";
var PROJECT_ROOT = import.meta.dirname;
var LOG_DIR = path.join(PROJECT_ROOT, ".manus-logs");
var MAX_LOG_SIZE_BYTES = 1 * 1024 * 1024;
var TRIM_TARGET_BYTES = Math.floor(MAX_LOG_SIZE_BYTES * 0.6);
function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}
function trimLogFile(logPath, maxSize) {
  try {
    if (!fs.existsSync(logPath) || fs.statSync(logPath).size <= maxSize) {
      return;
    }
    const lines = fs.readFileSync(logPath, "utf-8").split("\n");
    const keptLines = [];
    let keptBytes = 0;
    const targetSize = TRIM_TARGET_BYTES;
    for (let i = lines.length - 1; i >= 0; i--) {
      const lineBytes = Buffer.byteLength(`${lines[i]}
`, "utf-8");
      if (keptBytes + lineBytes > targetSize) break;
      keptLines.unshift(lines[i]);
      keptBytes += lineBytes;
    }
    fs.writeFileSync(logPath, keptLines.join("\n"), "utf-8");
  } catch {
  }
}
function writeToLogFile(source, entries) {
  if (entries.length === 0) return;
  ensureLogDir();
  const logPath = path.join(LOG_DIR, `${source}.log`);
  const lines = entries.map((entry) => {
    const ts = (/* @__PURE__ */ new Date()).toISOString();
    return `[${ts}] ${JSON.stringify(entry)}`;
  });
  fs.appendFileSync(logPath, `${lines.join("\n")}
`, "utf-8");
  trimLogFile(logPath, MAX_LOG_SIZE_BYTES);
}
function vitePluginManusDebugCollector() {
  return {
    name: "manus-debug-collector",
    transformIndexHtml(html) {
      if (process.env.NODE_ENV === "production") {
        return html;
      }
      return {
        html,
        tags: [
          {
            tag: "script",
            attrs: {
              src: "/__manus__/debug-collector.js",
              defer: true
            },
            injectTo: "head"
          }
        ]
      };
    },
    configureServer(server) {
      server.middlewares.use("/__manus__/logs", (req, res, next) => {
        if (req.method !== "POST") {
          return next();
        }
        const handlePayload = (payload) => {
          if (payload.consoleLogs?.length > 0) {
            writeToLogFile("browserConsole", payload.consoleLogs);
          }
          if (payload.networkRequests?.length > 0) {
            writeToLogFile("networkRequests", payload.networkRequests);
          }
          if (payload.sessionEvents?.length > 0) {
            writeToLogFile("sessionReplay", payload.sessionEvents);
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        };
        const reqBody = req.body;
        if (reqBody && typeof reqBody === "object") {
          try {
            handlePayload(reqBody);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
          return;
        }
        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });
        req.on("end", () => {
          try {
            const payload = JSON.parse(body);
            handlePayload(payload);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
        });
      });
    }
  };
}
var plugins = [react(), tailwindcss(), jsxLocPlugin(), vitePluginManusRuntime(), vitePluginManusDebugCollector()];
var vite_config_default = defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets")
    }
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true
  },
  server: {
    host: true,
    allowedHosts: [
      ".manuspre.computer",
      ".manus.computer",
      ".manus-asia.computer",
      ".manuscomputer.ai",
      ".manusvm.computer",
      "localhost",
      "127.0.0.1"
    ],
    fs: {
      strict: true,
      deny: ["**/.*"]
    }
  }
});

// server/_core/vite.ts
async function setupVite(app, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    server: serverOptions,
    appType: "custom"
  });
  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path2.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );
      let template = await fs2.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app) {
  if (process.env.VERCEL) {
    return;
  }
  const candidates = [
    path2.resolve(import.meta.dirname, "public"),
    path2.resolve(import.meta.dirname, "../..", "dist", "public"),
    path2.resolve(process.cwd(), "dist", "public")
  ];
  const distPath = candidates.find((p) => fs2.existsSync(p));
  if (!distPath) {
    console.error(
      `Could not find the build directory, make sure to build the client first`
    );
    return;
  }
  app.use(express.static(distPath));
  app.use("*", (_req, res) => {
    res.sendFile(path2.resolve(distPath, "index.html"));
  });
}

// server/_core/index.ts
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}
async function findAvailablePort(startPort = 3e3) {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}
async function createExpressApp() {
  const app = express2();
  const server = createServer(app);
  app.use(express2.json({ limit: "50mb" }));
  app.use(express2.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext
    })
  );
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  return { app, server };
}
if (process.env.NODE_ENV !== "production" || !process.env.VERCEL) {
  async function startServer() {
    const { server } = await createExpressApp();
    const preferredPort = parseInt(process.env.PORT || "3000");
    const port = await findAvailablePort(preferredPort);
    if (port !== preferredPort) {
      console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
    }
    server.listen(port, () => {
      console.log(`Server running on http://localhost:${port}/`);
    });
  }
  startServer().catch(console.error);
}

// server/_core/serverless.ts
var cachedApp = null;
async function handler(req, res) {
  if (!cachedApp) {
    const { app } = await createExpressApp();
    cachedApp = app;
  }
  return cachedApp(req, res);
}
export {
  handler as default
};
