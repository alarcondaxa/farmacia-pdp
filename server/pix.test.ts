import { describe, expect, it } from "vitest";
import { buildPixPayload, crc16, sanitize } from "../shared/pix";

describe("buildPixPayload", () => {
  it("gera um BR Code com os campos obrigatórios e CRC válido", () => {
    const payload = buildPixPayload({
      key: "teste@loja.com.br",
      merchantName: "Loja T.G",
      merchantCity: "São Paulo",
      amount: 870,
      txid: "TG-000001",
    });

    expect(payload.startsWith("000201")).toBe(true);
    expect(payload).toContain("br.gov.bcb.pix");
    expect(payload).toContain("teste@loja.com.br");
    expect(payload).toContain("5303986");
    expect(payload).toContain("5406870.00");
    expect(payload).toContain("5802BR");

    // O CRC final deve conferir com o cálculo sobre o restante do payload.
    const body = payload.slice(0, -4);
    expect(payload.slice(-4)).toBe(crc16(body));
  });

  it("omite o valor quando o total é zero", () => {
    const payload = buildPixPayload({
      key: "11999998888",
      merchantName: "Loja",
      merchantCity: "Recife",
      amount: 0,
    });

    expect(payload).not.toContain("54");
    expect(payload).toContain("6304");
  });

  it("rejeita chave vazia", () => {
    expect(() =>
      buildPixPayload({
        key: "   ",
        merchantName: "Loja",
        merchantCity: "Recife",
        amount: 10,
      }),
    ).toThrowError(/Chave Pix/);
  });

  it("remove acentos e limita o tamanho dos nomes", () => {
    expect(sanitize("São Paulo", 15)).toBe("SAO PAULO");
    expect(sanitize("Farmácia Muito Grande Nome", 10)).toHaveLength(10);
  });
});
