import { createHash } from "node:crypto";

/**
 * Conversions API do Meta (server-side).
 *
 * Por que existe: o Meta Pixel roda no navegador e é bloqueado por extensões,
 * modo restrito e ITP. A Conversions API envia a mesma conversão direto do
 * servidor, recuperando as vendas que o pixel perde. Como o `event_id` enviado
 * aqui é o mesmo usado pelo pixel (a referência do pedido), o Meta desduplica
 * automaticamente e a venda não é contada duas vezes.
 *
 * Privacidade: nenhum dado pessoal vai em texto puro. E-mail, telefone, nome,
 * CPF, cidade, estado e CEP são normalizados e enviados como hash SHA-256,
 * conforme exigido pela documentação do Meta.
 */

const GRAPH_VERSION = "v21.0";

/** SHA-256 em hexadecimal, formato aceito pelo Meta em `user_data`. */
function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * Normaliza e aplica hash. O Meta exige minúsculas e sem espaços nas pontas;
 * valores vazios devolvem `undefined` para que a chave nem seja enviada.
 */
function hashed(value: string | null | undefined): string | undefined {
  const normalized = (value ?? "").trim().toLowerCase();
  if (!normalized) return undefined;
  return sha256(normalized);
}

/** Só dígitos, usado em telefone, CPF e CEP antes do hash. */
function hashedDigits(
  value: string | null | undefined,
  prefix = "",
): string | undefined {
  const digits = (value ?? "").replace(/\D/g, "");
  if (!digits) return undefined;
  return sha256(`${prefix}${digits}`);
}

/**
 * Telefone brasileiro em formato E.164 sem o "+", como o Meta recomenda:
 * 55 + DDD + número. Se o cliente já digitou o 55, não duplica.
 */
function hashedPhone(value: string | null | undefined): string | undefined {
  const digits = (value ?? "").replace(/\D/g, "");
  if (digits.length < 10) return undefined;
  const withCountry = digits.startsWith("55") ? digits : `55${digits}`;
  return sha256(withCountry);
}

/** Separa nome e sobrenome, que o Meta espera em campos distintos. */
function splitName(fullName: string): { first?: string; last?: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return {};
  if (parts.length === 1) return { first: parts[0] };
  return { first: parts[0], last: parts[parts.length - 1] };
}

export type CapiOrder = {
  reference: string;
  customerName: string;
  email: string;
  phone: string;
  cpf: string;
  cep: string;
  city: string;
  state: string;
  total: number;
  clientIp?: string | null;
  /** Momento da compra em segundos (epoch). Padrão: agora. */
  eventTime?: number;
  contents: { id: string; quantity: number; price: number }[];
};

export type CapiConfig = {
  pixelId: string;
  accessToken: string;
  /** Código de teste do Events Manager, opcional. */
  testEventCode?: string;
  /** URL da página de confirmação, usada como `event_source_url`. */
  sourceUrl?: string;
};

export type CapiResult =
  | { sent: true; eventsReceived: number }
  | { sent: false; reason: string };

/**
 * Monta o corpo do evento Purchase. Exportado para permitir teste sem rede.
 */
export function buildPurchasePayload(order: CapiOrder, config: CapiConfig) {
  const { first, last } = splitName(order.customerName);

  const userData: Record<string, unknown> = {
    em: hashed(order.email) ? [hashed(order.email)] : undefined,
    ph: hashedPhone(order.phone) ? [hashedPhone(order.phone)] : undefined,
    fn: hashed(first) ? [hashed(first)] : undefined,
    ln: hashed(last) ? [hashed(last)] : undefined,
    ct: hashed(order.city.replace(/\s+/g, ""))
      ? [hashed(order.city.replace(/\s+/g, ""))]
      : undefined,
    st: hashed(order.state) ? [hashed(order.state)] : undefined,
    zp: hashedDigits(order.cep) ? [hashedDigits(order.cep)] : undefined,
    country: [sha256("br")],
    // CPF entra como identificador externo, o campo previsto para documentos.
    external_id: hashedDigits(order.cpf) ? [hashedDigits(order.cpf)] : undefined,
    client_ip_address: order.clientIp || undefined,
  };

  // Remove chaves vazias: o Meta rejeita campos nulos dentro de user_data.
  for (const key of Object.keys(userData)) {
    if (userData[key] === undefined) delete userData[key];
  }

  const body: Record<string, unknown> = {
    data: [
      {
        event_name: "Purchase",
        event_time: order.eventTime ?? Math.floor(Date.now() / 1000),
        // Mesmo id usado pelo pixel no navegador → o Meta desduplica.
        event_id: order.reference,
        action_source: "website",
        event_source_url: config.sourceUrl || undefined,
        user_data: userData,
        custom_data: {
          currency: "BRL",
          value: Number(order.total.toFixed(2)),
          order_id: order.reference,
          content_type: "product",
          contents: order.contents.map(item => ({
            id: item.id,
            quantity: item.quantity,
            item_price: Number(item.price.toFixed(2)),
          })),
        },
      },
    ],
  };

  if (config.testEventCode) body.test_event_code = config.testEventCode;

  return body;
}

/**
 * Envia a compra ao Meta. Nunca lança: falha de rede ou token inválido não pode
 * impedir o admin de marcar o pedido como pago, então o erro é apenas relatado.
 */
export async function sendPurchaseToMeta(
  order: CapiOrder,
  config: CapiConfig,
): Promise<CapiResult> {
  if (!config.pixelId || !config.accessToken) {
    return { sent: false, reason: "Pixel ID ou token da Conversions API ausente" };
  }

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${config.pixelId}/events?access_token=${encodeURIComponent(config.accessToken)}`;
  const payload = buildPurchasePayload(order, config);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const text = await response.text();

    if (!response.ok) {
      return {
        sent: false,
        reason: `Meta respondeu ${response.status}: ${text.slice(0, 300)}`,
      };
    }

    let received = 1;
    try {
      const parsed = JSON.parse(text) as { events_received?: number };
      received = parsed.events_received ?? 1;
    } catch {
      // Resposta fora do formato esperado, mas HTTP 200: considera enviado.
    }

    return { sent: true, eventsReceived: received };
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "Falha ao contatar o Meta";
    return { sent: false, reason };
  }
}
