/**
 * Geração de BR Code Pix (padrão EMV do Banco Central).
 *
 * O payload é uma sequência de campos "ID + tamanho + valor". Ao final entra o
 * CRC16-CCITT (polinômio 0x1021, inicial 0xFFFF) calculado sobre todo o texto
 * incluindo o identificador "6304".
 *
 * Referência: Manual de Padrões para Iniciação do Pix (BCB).
 */

export type PixInput = {
  /** Chave Pix do recebedor: CPF/CNPJ, e-mail, telefone ou chave aleatória. */
  key: string;
  /** Nome do recebedor, máximo 25 caracteres. */
  merchantName: string;
  /** Cidade do recebedor, máximo 15 caracteres. */
  merchantCity: string;
  /** Valor em reais. Use 0 para deixar o pagador digitar. */
  amount: number;
  /** Identificador do pedido (txid), até 25 caracteres alfanuméricos. */
  txid?: string;
};

/** Monta um campo EMV com o tamanho em duas casas. */
function field(id: string, value: string): string {
  const size = value.length.toString().padStart(2, "0");
  return `${id}${size}${value}`;
}

/** Remove acentos e caracteres não suportados pelo BR Code. */
export function sanitize(text: string, maxLength: number): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 .,\-]/g, "")
    .trim()
    .slice(0, maxLength)
    .toUpperCase();
}

/** Normaliza o txid para os caracteres aceitos (A-Z, a-z, 0-9). */
export function sanitizeTxid(text: string): string {
  const cleaned = text.replace(/[^A-Za-z0-9]/g, "").slice(0, 25);
  return cleaned.length > 0 ? cleaned : "***";
}

/** CRC16-CCITT usado no campo 63 do BR Code. */
export function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/**
 * Gera o código Pix copia-e-cola. O mesmo texto alimenta o QR Code.
 */
export function buildPixPayload({
  key,
  merchantName,
  merchantCity,
  amount,
  txid,
}: PixInput): string {
  const trimmedKey = key.trim();
  if (!trimmedKey) {
    throw new Error("Chave Pix não configurada");
  }

  const merchantAccount =
    field("00", "br.gov.bcb.pix") + field("01", trimmedKey);

  const additionalData = field("05", sanitizeTxid(txid ?? ""));

  let payload =
    field("00", "01") + // Payload Format Indicator
    field("26", merchantAccount) + // Merchant Account Information - Pix
    field("52", "0000") + // Merchant Category Code
    field("53", "986"); // Moeda: BRL

  if (amount > 0) {
    payload += field("54", amount.toFixed(2));
  }

  payload +=
    field("58", "BR") +
    field("59", sanitize(merchantName, 25) || "RECEBEDOR") +
    field("60", sanitize(merchantCity, 15) || "SAO PAULO") +
    field("62", additionalData);

  const withCrcId = `${payload}6304`;
  return `${withCrcId}${crc16(withCrcId)}`;
}
