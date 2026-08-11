/**
 * Entrada da função serverless (Vercel).
 *
 * Monta o app Express apenas com as rotas de API/OAuth/storage. Os arquivos
 * estáticos do frontend são entregues pela CDN da Vercel, portanto o Vite não é
 * importado aqui — o que também evita carregar Rollup em runtime.
 */
import "dotenv/config";
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";

function buildApp() {
  const app = express();
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  registerStorageProxy(app);
  registerOAuthRoutes(app);

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  return app;
}

const app = buildApp();

export default function handler(req: any, res: any) {
  return (app as any)(req, res);
}
