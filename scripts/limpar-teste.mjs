/**
 * Remove os dados de validação criados durante os testes:
 * o pedido de teste, os cliques registrados e a chave Pix provisória.
 * Restaura o estoque da dosagem 15mg.
 */
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("Defina MONGODB_URI antes de executar.");
  process.exit(1);
}

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });

try {
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || "farmacia");

  const orders = await db
    .collection("orders")
    .deleteMany({ email: "teste.manus@exemplo.com" });
  console.log(`Pedidos de teste removidos: ${orders.deletedCount}`);

  const clicks = await db.collection("clicks").deleteMany({});
  console.log(`Cliques de teste removidos: ${clicks.deletedCount}`);

  await db.collection("counters").updateOne({ _id: "orders" }, { $set: { seq: 0 } });
  await db.collection("counters").updateOne({ _id: "clicks" }, { $set: { seq: 0 } });
  console.log("Contadores de pedidos e cliques zerados.");

  await db
    .collection("stock")
    .updateOne({ dosage: "15mg" }, { $set: { available: 3, updatedAt: new Date() } });
  console.log("Estoque da dosagem 15mg restaurado para 3 unidades.");

  await db.collection("settings").deleteMany({
    settingKey: { $in: ["pixKey", "pixReceiverName", "pixCity"] },
  });
  console.log("Chave Pix de teste removida.");

  const stock = await db
    .collection("stock")
    .find({}, { projection: { _id: 0 } })
    .toArray();
  console.log("\nEstoque final:");
  for (const s of stock) console.log(`  ${s.dosage}: ${s.available}/${s.lot}`);
} catch (error) {
  console.error("ERRO:", error.message);
  process.exitCode = 1;
} finally {
  await client.close();
}
