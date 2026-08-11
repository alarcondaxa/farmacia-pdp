import { describe, expect, it } from "vitest";
import {
  DISCOUNT_LABEL,
  DISCOUNT_RATE,
  brl,
  discounted,
  formatCountdown,
} from "./pricing";

describe("pricing", () => {
  it("aplica o desconto de 43% do dia", () => {
    expect(DISCOUNT_RATE).toBe(0.43);
    expect(DISCOUNT_LABEL).toBe("43%");
  });

  it("calcula o preço com desconto arredondado em centavos", () => {
    expect(discounted(1450)).toBe(826.5);
    expect(discounted(750)).toBe(427.5);
    expect(discounted(1150)).toBe(655.5);
  });

  it("formata valores em reais no padrão brasileiro", () => {
    expect(brl(826.5).replace(/\u00a0/g, " ")).toBe("R$ 826,50");
  });

  it("formata o contador como HH:MM:SS e nunca fica negativo", () => {
    expect(formatCountdown(3 * 3600_000 + 5 * 60_000 + 9_000)).toBe("03:05:09");
    expect(formatCountdown(-5000)).toBe("00:00:00");
  });
});
