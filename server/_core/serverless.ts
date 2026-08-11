/**
 * Entrada da função serverless (Vercel).
 *
 * O esbuild empacota este arquivo com todas as dependências internas
 * resolvidas, evitando erros de resolução de módulos ESM em runtime.
 */
import { createExpressApp } from "./index";

let cachedApp: any = null;

export default async function handler(req: any, res: any) {
  if (!cachedApp) {
    const { app } = await createExpressApp();
    cachedApp = app;
  }
  return cachedApp(req, res);
}
