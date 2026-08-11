import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildPurchasePayload, sendPurchaseToMeta } from "./metaCapi";

const sha = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");

const order = {
  reference: "TG-000123",
  customerName: "Maria Aparecida Souza",
  email: " Maria@Example.com ",
  phone: "(31) 98888-7777",
  cpf: "123.456.789-00",
  cep: "30130-010",
  city: "Belo Horizonte",
  state: "MG",
  total: 826.5,
  clientIp: "189.10.20.30",
  eventTime: 1_700_000_000,
  contents: [{ id: "1272202-15mg", quantity: 2, price: 826.5 }],
};

const config = { pixelId: "1234567890123456", accessToken: "EAAG-token" };

describe("Conversions API do Meta", () => {
  it("envia Purchase com valor, moeda e order_id do pedido", () => {
    const payload = buildPurchasePayload(order, config) as any;
    const event = payload.data[0];

    expect(event.event_name).toBe("Purchase");
    expect(event.action_source).toBe("website");
    expect(event.event_time).toBe(1_700_000_000);
    expect(event.custom_data.currency).toBe("BRL");
    expect(event.custom_data.value).toBe(826.5);
    expect(event.custom_data.order_id).toBe("TG-000123");
    expect(event.custom_data.contents).toEqual([
      { id: "1272202-15mg", quantity: 2, item_price: 826.5 },
    ]);
  });

  it("usa a referência do pedido como event_id para o Meta desduplicar", () => {
    const payload = buildPurchasePayload(order, config) as any;
    expect(payload.data[0].event_id).toBe("TG-000123");
  });

  it("nunca envia dados pessoais em texto puro", () => {
    const raw = JSON.stringify(buildPurchasePayload(order, config));

    expect(raw).not.toContain("maria@example.com");
    expect(raw).not.toContain("Maria");
    expect(raw).not.toContain("98888");
    expect(raw).not.toContain("12345678900");
    expect(raw).not.toContain("30130");
  });

  it("aplica hash SHA-256 normalizado em e-mail, nome e CEP", () => {
    const user = (buildPurchasePayload(order, config) as any).data[0].user_data;

    expect(user.em).toEqual([sha("maria@example.com")]);
    expect(user.fn).toEqual([sha("maria")]);
    expect(user.ln).toEqual([sha("souza")]);
    expect(user.zp).toEqual([sha("30130010")]);
    expect(user.st).toEqual([sha("mg")]);
    expect(user.country).toEqual([sha("br")]);
  });

  it("normaliza o telefone para E.164 (55 + DDD + número)", () => {
    const user = (buildPurchasePayload(order, config) as any).data[0].user_data;
    expect(user.ph).toEqual([sha("5531988887777")]);
  });

  it("não duplica o 55 quando o cliente já digitou o código do país", () => {
    const user = (
      buildPurchasePayload({ ...order, phone: "5531988887777" }, config) as any
    ).data[0].user_data;
    expect(user.ph).toEqual([sha("5531988887777")]);
  });

  it("envia o CPF como external_id com hash", () => {
    const user = (buildPurchasePayload(order, config) as any).data[0].user_data;
    expect(user.external_id).toEqual([sha("12345678900")]);
  });

  it("mantém o IP do cliente para melhorar a atribuição", () => {
    const user = (buildPurchasePayload(order, config) as any).data[0].user_data;
    expect(user.client_ip_address).toBe("189.10.20.30");
  });

  it("inclui test_event_code apenas quando configurado", () => {
    const semTeste = buildPurchasePayload(order, config) as any;
    expect(semTeste.test_event_code).toBeUndefined();

    const comTeste = buildPurchasePayload(order, {
      ...config,
      testEventCode: "TEST123",
    }) as any;
    expect(comTeste.test_event_code).toBe("TEST123");
  });

  it("omite campos vazios em vez de enviar nulos", () => {
    const user = (
      buildPurchasePayload(
        { ...order, phone: "", cpf: "", clientIp: null },
        config,
      ) as any
    ).data[0].user_data;

    expect(user).not.toHaveProperty("ph");
    expect(user).not.toHaveProperty("external_id");
    expect(user).not.toHaveProperty("client_ip_address");
  });

  it("recusa o envio sem pixel ou token, sem lançar erro", async () => {
    const semPixel = await sendPurchaseToMeta(order, {
      pixelId: "",
      accessToken: "EAAG",
    });
    expect(semPixel.sent).toBe(false);

    const semToken = await sendPurchaseToMeta(order, {
      pixelId: "1234567890123456",
      accessToken: "",
    });
    expect(semToken.sent).toBe(false);
  });
});
