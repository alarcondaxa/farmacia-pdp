/**
 * Formulário de cartão de crédito com preview visual.
 *
 * SEGURANÇA: número, validade e CVV vivem apenas no estado deste componente
 * (memória do navegador). Ao finalizar, o checkout envia ao servidor somente a
 * bandeira, os 4 últimos dígitos e o nome impresso. Guardar PAN/CVV exigiria
 * certificação PCI-DSS e o CVV não pode ser armazenado em nenhuma hipótese.
 */
import { CreditCard, Lock } from "lucide-react";
import {
  BRAND_LABEL,
  cvvLength,
  detectBrand,
  expectedLength,
  formatCardNumber,
  formatExpiry,
  isCvvValid,
  isExpiryValid,
  isHolderValid,
  isLuhnValid,
  onlyDigits,
} from "@/lib/card";

export type CardData = {
  holder: string;
  number: string;
  expiry: string;
  cvv: string;
};

export const emptyCard: CardData = {
  holder: "",
  number: "",
  expiry: "",
  cvv: "",
};

/** Valida o cartão e devolve a primeira mensagem de erro, se houver. */
export function validateCard(card: CardData): string | null {
  const brand = detectBrand(card.number);

  if (!isHolderValid(card.holder))
    return "Informe o nome completo impresso no cartão.";
  if (onlyDigits(card.number).length !== expectedLength(brand))
    return "O número do cartão está incompleto.";
  if (!isLuhnValid(card.number))
    return "Número de cartão inválido. Confira os dígitos.";
  if (!isExpiryValid(card.expiry))
    return "Validade inválida ou cartão vencido.";
  if (!isCvvValid(card.cvv, brand))
    return `O código de segurança deve ter ${cvvLength(brand)} dígitos.`;

  return null;
}

function CardField({
  label,
  value,
  onChange,
  placeholder,
  className = "",
  inputMode = "text",
  autoComplete,
  maxLength,
  valid,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  inputMode?: "text" | "numeric";
  autoComplete?: string;
  maxLength?: number;
  valid?: boolean;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-[13px] font-semibold text-rd-body">
        {label}
        <span className="text-rd-action"> *</span>
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        autoComplete={autoComplete}
        maxLength={maxLength}
        className={`w-full rounded-xl border bg-white px-3 py-2.5 text-[14px] text-rd-ink outline-none transition-colors focus:border-rd-action ${
          valid === false && value.length > 0
            ? "border-rd-action"
            : "border-rd-line2"
        }`} />
    </label>
  );
}

export default function CardForm({
  card,
  onChange,
}: {
  card: CardData;
  onChange: (next: CardData) => void;
}) {
  const brand = detectBrand(card.number);
  const set = (key: keyof CardData) => (value: string) =>
    onChange({ ...card, [key]: value });

  const digits = onlyDigits(card.number);
  const maskedPreview =
    formatCardNumber(card.number) ||
    (brand === "amex" ? "•••• •••••• •••••" : "•••• •••• •••• ••••");

  return (
    <div className="mt-4">
      {/* Preview do cartão: reforça confiança e ajuda a conferir os dados */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-rd-dark to-rd-action p-5 text-white">
        <div className="flex items-start justify-between">
          <CreditCard size={26} className="opacity-90" />
          <span className="text-[12px] font-bold uppercase tracking-wide opacity-90">
            {brand === "desconhecida" ? "" : BRAND_LABEL[brand]}
          </span>
        </div>
        <p className="mt-6 font-mono text-[18px] tracking-[0.12em]">
          {maskedPreview}
        </p>
        <div className="mt-4 flex items-end justify-between gap-4">
          <div className="min-w-0">
            <span className="block text-[10px] uppercase tracking-wide opacity-75">
              Nome impresso
            </span>
            <span className="block truncate text-[13px] font-semibold uppercase">
              {card.holder || "SEU NOME"}
            </span>
          </div>
          <div className="text-right">
            <span className="block text-[10px] uppercase tracking-wide opacity-75">
              Validade
            </span>
            <span className="block text-[13px] font-semibold">
              {card.expiry || "MM/AA"}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-6">
        <CardField
          label="Nome impresso no cartão"
          value={card.holder}
          onChange={(v) => set("holder")(v.replace(/[0-9]/g, ""))}
          placeholder="Como está escrito no cartão"
          autoComplete="cc-name"
          className="sm:col-span-6"
          valid={isHolderValid(card.holder)} />

        <CardField
          label="Número do cartão"
          value={formatCardNumber(card.number)}
          onChange={(v) => set("number")(onlyDigits(v))}
          placeholder="0000 0000 0000 0000"
          inputMode="numeric"
          autoComplete="cc-number"
          className="sm:col-span-6"
          valid={
            digits.length === expectedLength(brand) && isLuhnValid(card.number)
          } />

        <CardField
          label="Validade"
          value={card.expiry}
          onChange={(v) => set("expiry")(formatExpiry(v))}
          placeholder="MM/AA"
          inputMode="numeric"
          autoComplete="cc-exp"
          maxLength={5}
          className="sm:col-span-3"
          valid={isExpiryValid(card.expiry)} />

        <CardField
          label={`Código de segurança (${cvvLength(brand)} dígitos)`}
          value={card.cvv}
          onChange={(v) => set("cvv")(onlyDigits(v).slice(0, cvvLength(brand)))}
          placeholder={brand === "amex" ? "0000" : "000"}
          inputMode="numeric"
          autoComplete="cc-csc"
          className="sm:col-span-3"
          valid={isCvvValid(card.cvv, brand)} />
      </div>

      <p className="mt-3 flex items-start gap-2 rounded-xl bg-rd-bg p-3 text-[12px] text-rd-body">
        <Lock size={14} className="mt-px shrink-0 text-rd-green" />
        Conexão protegida. Os dados do cartão são usados apenas para processar
        esta compra e não ficam armazenados na loja.
      </p>
    </div>
  );
}
