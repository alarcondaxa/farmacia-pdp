import { describe, expect, it } from "vitest";
import {
  cvvLength,
  detectBrand,
  formatCardNumber,
  formatExpiry,
  isCvvValid,
  isExpiryValid,
  isHolderValid,
  isLuhnValid,
  lastFour,
} from "./card";

describe("detectBrand", () => {
  it("identifica as bandeiras mais comuns no Brasil", () => {
    expect(detectBrand("4111111111111111")).toBe("visa");
    expect(detectBrand("5555 5555 5555 4444")).toBe("mastercard");
    expect(detectBrand("378282246310005")).toBe("amex");
    expect(detectBrand("6362 9700 0000 0000")).toBe("elo");
    expect(detectBrand("6062 8200 0000 0000")).toBe("hipercard");
    expect(detectBrand("9999999999999999")).toBe("desconhecida");
  });
});

describe("formatCardNumber", () => {
  it("agrupa em 4-4-4-4 e respeita o limite da bandeira", () => {
    expect(formatCardNumber("4111111111111111")).toBe("4111 1111 1111 1111");
    expect(formatCardNumber("41111111111111119999")).toBe(
      "4111 1111 1111 1111",
    );
  });

  it("usa o agrupamento 4-6-5 da Amex", () => {
    expect(formatCardNumber("378282246310005")).toBe("3782 822463 10005");
  });
});

describe("isLuhnValid", () => {
  it("aceita números válidos e recusa dígito trocado", () => {
    expect(isLuhnValid("4111 1111 1111 1111")).toBe(true);
    expect(isLuhnValid("5555555555554444")).toBe(true);
    expect(isLuhnValid("4111 1111 1111 1112")).toBe(false);
    expect(isLuhnValid("411")).toBe(false);
  });
});

describe("validade", () => {
  it("formata MM/AA enquanto o cliente digita", () => {
    expect(formatExpiry("1")).toBe("1");
    expect(formatExpiry("12")).toBe("12");
    expect(formatExpiry("1230")).toBe("12/30");
    expect(formatExpiry("12/3099")).toBe("12/30");
  });

  it("recusa mês inexistente e cartão vencido", () => {
    expect(isExpiryValid("13/30")).toBe(false);
    expect(isExpiryValid("00/30")).toBe(false);
    expect(isExpiryValid("01/20")).toBe(false);
    expect(isExpiryValid("12/9")).toBe(false);
  });

  it("aceita data futura", () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 2);
    const mm = String(future.getMonth() + 1).padStart(2, "0");
    const yy = String(future.getFullYear() % 100).padStart(2, "0");
    expect(isExpiryValid(`${mm}/${yy}`)).toBe(true);
  });
});

describe("cvv e titular", () => {
  it("exige 4 dígitos na Amex e 3 nas demais", () => {
    expect(cvvLength("amex")).toBe(4);
    expect(cvvLength("visa")).toBe(3);
    expect(isCvvValid("123", "visa")).toBe(true);
    expect(isCvvValid("12", "visa")).toBe(false);
    expect(isCvvValid("1234", "amex")).toBe(true);
  });

  it("exige nome e sobrenome sem números", () => {
    expect(isHolderValid("Maria Souza")).toBe(true);
    expect(isHolderValid("Maria")).toBe(false);
    expect(isHolderValid("Maria 2")).toBe(false);
    expect(isHolderValid("M S")).toBe(false);
  });
});

describe("lastFour", () => {
  it("extrai apenas os 4 últimos dígitos", () => {
    expect(lastFour("4111 1111 1111 1111")).toBe("1111");
    expect(lastFour("378282246310005")).toBe("0005");
  });
});
