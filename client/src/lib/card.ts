/**
 * Utilitários do formulário de cartão.
 *
 * IMPORTANTE: nada aqui persiste dados sensíveis. O número completo, a validade
 * e o CVV existem apenas em memória durante o preenchimento; ao enviar o pedido
 * somente a bandeira e os 4 últimos dígitos seguem para o servidor.
 */

export type CardBrand =
  | "visa"
  | "mastercard"
  | "amex"
  | "elo"
  | "hipercard"
  | "diners"
  | "desconhecida";

export const BRAND_LABEL: Record<CardBrand, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "American Express",
  elo: "Elo",
  hipercard: "Hipercard",
  diners: "Diners Club",
  desconhecida: "Cartão",
};

export const onlyDigits = (value: string) => value.replace(/\D/g, "");

/** Detecta a bandeira pelos prefixos usados no Brasil. */
export function detectBrand(numberInput: string): CardBrand {
  const n = onlyDigits(numberInput);
  if (/^4/.test(n)) return "visa";
  if (/^(5[1-5]|2[2-7])/.test(n)) return "mastercard";
  if (/^3[47]/.test(n)) return "amex";
  if (/^(636368|438935|504175|451416|509\d{3}|627780|636297|65003[1-3])/.test(n))
    return "elo";
  if (/^(606282|3841)/.test(n)) return "hipercard";
  if (/^(30[0-5]|36|38)/.test(n)) return "diners";
  return "desconhecida";
}

/** Quantidade de dígitos esperada por bandeira. */
export function expectedLength(brand: CardBrand): number {
  if (brand === "amex") return 15;
  if (brand === "diners") return 14;
  return 16;
}

/** Agrupamento visual: Amex usa 4-6-5, as demais 4-4-4-4. */
export function formatCardNumber(value: string): string {
  const brand = detectBrand(value);
  const digits = onlyDigits(value).slice(0, expectedLength(brand));

  const groups = brand === "amex" ? [4, 6, 5] : [4, 4, 4, 4];
  const parts: string[] = [];
  let index = 0;
  for (const size of groups) {
    if (index >= digits.length) break;
    parts.push(digits.slice(index, index + size));
    index += size;
  }
  return parts.join(" ");
}

/** Algoritmo de Luhn: detecta números digitados incorretamente. */
export function isLuhnValid(numberInput: string): boolean {
  const digits = onlyDigits(numberInput);
  if (digits.length < 13) return false;

  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = Number(digits[i]);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

export function formatExpiry(value: string): string {
  const d = onlyDigits(value).slice(0, 4);
  if (d.length <= 2) return d;
  return `${d.slice(0, 2)}/${d.slice(2)}`;
}

/** Valida mês 01-12 e data não vencida (considera o mês corrente como válido). */
export function isExpiryValid(value: string): boolean {
  const d = onlyDigits(value);
  if (d.length !== 4) return false;

  const month = Number(d.slice(0, 2));
  const year = 2000 + Number(d.slice(2));
  if (month < 1 || month > 12) return false;

  const now = new Date();
  const lastDay = new Date(year, month, 0, 23, 59, 59);
  return lastDay.getTime() >= now.getTime();
}

export function cvvLength(brand: CardBrand): number {
  return brand === "amex" ? 4 : 3;
}

export function isCvvValid(cvv: string, brand: CardBrand): boolean {
  return onlyDigits(cvv).length === cvvLength(brand);
}

/** Nome impresso: pelo menos duas palavras, apenas letras e espaços. */
export function isHolderValid(name: string): boolean {
  const cleaned = name.trim().replace(/\s+/g, " ");
  if (cleaned.length < 5) return false;
  if (!cleaned.includes(" ")) return false;
  return /^[A-Za-zÀ-ÿ' ]+$/.test(cleaned);
}

export function lastFour(numberInput: string): string {
  return onlyDigits(numberInput).slice(-4);
}
