/**
 * RÉPLICA — regras de preço da PDP T.G.
 * Desconto promocional de 43% aplicado sobre o preço de tabela ("de"),
 * válido apenas no dia corrente. Parcelamento máximo em 3x sem juros.
 */
export const DISCOUNT_RATE = 0.43;
export const MAX_INSTALLMENTS = 3;

/** Rótulo do desconto usado em toda a interface (evita divergência de texto). */
export const DISCOUNT_LABEL = `${Math.round(DISCOUNT_RATE * 100)}%`;

export const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Preço com o desconto do dia aplicado sobre o valor de tabela. */
export const discounted = (listPrice: number) =>
  Math.round(listPrice * (1 - DISCOUNT_RATE) * 100) / 100;

/** Fim do dia atual, usado pelo contador da promoção. */
export const endOfToday = () => {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
};

/** Formata o tempo restante como HH:MM:SS. */
export const formatCountdown = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(total / 3600)).padStart(2, "0");
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
};
