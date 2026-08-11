import { createExpressApp } from "../server/_core/index.js";

let cached: any = null;

export default async function handler(req: any, res: any) {
  if (!cached) {
    const { app } = await createExpressApp();
    cached = app;
  }
  return cached(req, res);
}
