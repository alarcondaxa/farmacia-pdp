/**
 * Inicializa o banco no MongoDB Atlas: cria índices, o estoque inicial por
 * dosagem e as configurações padrão da loja. Pode ser executado várias vezes
 * sem duplicar dados (é idempotente).
 */
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("Defina MONGODB_URI antes de executar.");
  process.exit(1);
}

const DOSAGES = [
  { dosage: "2,5mg", available: 8, lot: 10 },
  { dosage: "5mg", available: 6, lot: 10 },
  { dosage: "7,5mg", available: 5, lot: 10 },
  { dosage: "10mg", available: 4, lot: 10 },
  { dosage: "12,5mg", available: 4, lot: 10 },
  { dosage: "15mg", available: 3, lot: 10 },
];

const DEFAULT_SETTINGS = {
  pixKeyType: "cpf",
  maxOrdersPerIp: "3",
  ipWindowHours: "24",
  trackingEnabled: "0",
};

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });

try {
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || "farmacia");

  // Índices
  await db.collection("users").createIndex({ openId: 1 }, { unique: true });
  await db.collection("orders").createIndex({ reference: 1 }, { unique: true });
  await db.collection("orders").createIndex({ id: 1 }, { unique: true });
  await db.collection("orders").createIndex({ clientIp: 1 });
  await db.collection("orders").createIndex({ createdAt: -1 });
  await db.collection("settings").createIndex({ settingKey: 1 }, { unique: true });
  await db.collection("stock").createIndex({ dosage: 1 }, { unique: true });
  await db.collection("clicks").createIndex({ elementId: 1 });
  await db.collection("clicks").createIndex({ createdAt: -1 });
  console.log("Índices criados.");

  // Contadores
  for (const name of ["users", "orders", "stock", "clicks"]) {
    await db
      .collection("counters")
      .updateOne({ _id: name }, { $setOnInsert: { seq: 0 } }, { upsert: true });
  }
  console.log("Contadores inicializados.");

  // Estoque inicial
  let seq = 0;
  for (const item of DOSAGES) {
    const existing = await db.collection("stock").findOne({ dosage: item.dosage });
    if (existing) continue;
    seq += 1;
    await db.collection("stock").insertOne({
      id: seq,
      ...item,
      updatedAt: new Date(),
    });
  }
  if (seq > 0) {
    await db
      .collection("counters")
      .updateOne({ _id: "stock" }, { $set: { seq } }, { upsert: true });
  }
  console.log("Estoque inicial pronto.");

  // Configurações padrão
  for (const [settingKey, settingValue] of Object.entries(DEFAULT_SETTINGS)) {
    await db.collection("settings").updateOne(
      { settingKey },
      { $setOnInsert: { settingValue, updatedAt: new Date() } },
      { upsert: true }
    );
  }
  console.log("Configurações padrão prontas.");

  // Limpeza do healthcheck usado no teste de conexão
  await db.collection("_healthcheck").drop().catch(() => {});

  const stock = await db.collection("stock").find({}, { projection: { _id: 0 } }).toArray();
  console.log("\nEstoque atual:");
  for (const s of stock) {
    console.log(`  ${s.dosage}: ${s.available}/${s.lot}`);
  }

  const collections = await db.listCollections().toArray();
  console.log("\nColeções:", collections.map((c) => c.name).sort().join(", "));
} catch (error) {
  console.error("ERRO:", error.message);
  process.exitCode = 1;
} finally {
  await client.close();
}
