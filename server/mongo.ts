/**
 * Conexão com o MongoDB Atlas.
 *
 * O cliente é criado uma única vez por instância (lazy) e reaproveitado entre
 * invocações da função serverless, evitando abrir uma conexão nova a cada
 * requisição — prática recomendada para ambientes serverless.
 */
import { Db, MongoClient } from "mongodb";

let clientPromise: Promise<MongoClient> | null = null;

function getUri(): string | undefined {
  return process.env.MONGODB_URI || process.env.DATABASE_URL;
}

function getDbName(): string {
  return process.env.MONGODB_DB || "farmacia";
}

/**
 * Devolve a instância do banco ou `null` quando nenhuma URI está configurada,
 * permitindo que o projeto rode localmente sem banco.
 */
export async function getMongo(): Promise<Db | null> {
  const uri = getUri();
  if (!uri || !uri.startsWith("mongodb")) {
    return null;
  }

  try {
    if (!clientPromise) {
      const client = new MongoClient(uri, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 10000,
      });
      clientPromise = client.connect();
    }

    const client = await clientPromise;
    return client.db(getDbName());
  } catch (error) {
    console.error("[MongoDB] Falha ao conectar:", error);
    clientPromise = null;
    return null;
  }
}

/**
 * Gera ids numéricos sequenciais, substituindo o auto-increment do MySQL.
 * Usa `findOneAndUpdate` com `$inc`, que é atômico no MongoDB.
 */
export async function nextSequence(name: string): Promise<number> {
  const db = await getMongo();
  if (!db) throw new Error("Banco de dados indisponível");

  const result = await db
    .collection<{ _id: string; seq: number }>("counters")
    .findOneAndUpdate(
      { _id: name },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: "after" }
    );

  return result?.seq ?? 1;
}

/** Garante os índices usados pelas consultas do projeto. */
export async function ensureIndexes(): Promise<void> {
  const db = await getMongo();
  if (!db) return;

  await Promise.all([
    db.collection("users").createIndex({ openId: 1 }, { unique: true }),
    db.collection("orders").createIndex({ reference: 1 }, { unique: true }),
    db.collection("orders").createIndex({ id: 1 }, { unique: true }),
    db.collection("orders").createIndex({ clientIp: 1 }),
    db.collection("orders").createIndex({ createdAt: -1 }),
    db.collection("settings").createIndex({ settingKey: 1 }, { unique: true }),
    db.collection("stock").createIndex({ dosage: 1 }, { unique: true }),
    db.collection("clicks").createIndex({ elementId: 1 }),
    db.collection("clicks").createIndex({ pageUrl: 1, elementId: 1, createdAt: -1 }),
    db.collection("clicks").createIndex({ createdAt: -1 }),
  ]);
}
