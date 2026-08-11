/**
 * Pós-checkout. Para Pix, esta é a tela decisiva: QR Code grande em primeiro
 * lugar, botão de copiar destacado, passo a passo numerado, contador de
 * expiração e reforços de confiança para reduzir abandono.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "wouter";
import {
  BadgeCheck,
  CheckCheck,
  CheckCircle2,
  Clipboard,
  ClipboardCheck,
  Clock,
  CreditCard,
  Loader2,
  Lock,
  MessageCircle,
  Package,
  QrCode,
  Smartphone,
  Truck,
  XCircle,
} from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { brl, discounted } from "@/lib/pricing";
import { trackEvent, trackPurchase } from "@/lib/tracking";
import { trpc } from "@/lib/trpc";

/** Janela de pagamento do Pix exibida ao cliente. */
const PIX_WINDOW_MINUTES = 30;

function useCountdown(startedAt?: Date) {
  const deadline = useMemo(() => {
    const base = startedAt ? new Date(startedAt) : new Date();
    return base.getTime() + PIX_WINDOW_MINUTES * 60 * 1000;
  }, [startedAt]);

  const [remaining, setRemaining] = useState(() =>
    Math.max(0, deadline - Date.now()),
  );

  useEffect(() => {
    const timer = setInterval(
      () => setRemaining(Math.max(0, deadline - Date.now())),
      1000,
    );
    return () => clearInterval(timer);
  }, [deadline]);

  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  return {
    expired: remaining <= 0,
    label: `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`,
  };
}

function Step({
  index,
  icon,
  title,
  description,
}: {
  index: number;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <li className="flex gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rd-pink text-[13px] font-bold text-rd-dark">
        {index}
      </span>
      <div>
        <p className="flex items-center gap-1.5 text-[14px] font-semibold text-rd-ink">
          {icon}
          {title}
        </p>
        <p className="text-[13px] leading-relaxed text-rd-body">{description}</p>
      </div>
    </li>
  );
}

export default function OrderConfirmed() {
  const [params] = useSearchParams();
  const reference = params.get("ref") ?? "";

  const orderQuery = trpc.store.getOrder.useQuery(
    { reference },
    { enabled: reference.length > 0, retry: false },
  );

  const [qrDataUrl, setQrDataUrl] = useState("");
  const [copied, setCopied] = useState(false);
  // Uma vez revelado, o bloco "Já paguei" permanece visível — o rótulo do botão
  // de copiar volta ao normal depois de 3s, mas o aviso não desaparece.
  const [claimVisible, setClaimVisible] = useState(false);

  const order = orderQuery.data;
  const pixPayload = order?.pixPayload ?? "";
  const countdown = useCountdown(order?.createdAt);

  const utils = trpc.useUtils();
  const claimPayment = trpc.store.claimPayment.useMutation({
    onSuccess: () => {
      utils.store.getOrder.invalidate({ reference });
      toast.success("Recebemos seu aviso!", {
        description:
          "Vamos confirmar o pagamento e seu pedido entra em separação.",
      });
    },
    onError: () =>
      toast.error("Não foi possível registrar seu aviso. Tente novamente."),
  });

  // O botão "Já paguei" só aparece depois de copiar o código ou escanear,
  // evitando cliques acidentais antes de o cliente ver o QR Code.
  const alreadyClaimed =
    order?.status === "awaiting_confirmation" ||
    order?.status === "paid" ||
    order?.status === "shipped";

  useEffect(() => {
    if (!pixPayload) {
      setQrDataUrl("");
      return;
    }
    QRCode.toDataURL(pixPayload, { width: 460, margin: 1 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [pixPayload]);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(pixPayload);
      setCopied(true);
      setClaimVisible(true);
      toast.success("Código Pix copiado! Cole no app do seu banco.");
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // Mesmo sem permissão de clipboard, o cliente pode copiar manualmente
      // pelo expansor abaixo — então o botão "Já paguei" também é liberado.
      setClaimVisible(true);
      toast.error("Não foi possível copiar automaticamente.", {
        description: "Abra 'Ver código Pix completo' e copie manualmente.",
      });
    }
  };

  const isPix = order?.paymentMethod === "pix" && Boolean(pixPayload);
  // Cartão não autorizado: o pedido está salvo, mas o pagamento não passou.
  const declined = order?.status === "card_declined";

  // Quanto o mesmo pedido custaria no Pix (o cartão vai pelo preço de tabela).
  // Serve para mostrar a economia real na tela de recusa.
  const pixTotal = useMemo(() => {
    if (!order) return 0;
    const cents = order.items.reduce(
      (sum, item) =>
        sum + Math.round(discounted(item.listPrice) * 100) * item.quantity,
      0,
    );
    return cents / 100;
  }, [order]);

  /**
   * Dois eventos distintos, para não contar venda que ainda não entrou:
   *
   * - Pedido criado e aguardando Pix → `checkout_started` (Meta InitiateCheckout).
   *   Serve para otimizar campanha, sem inflar a receita.
   * - Pagamento confirmado no painel (`paid`/`shipped`) → `purchase` de verdade,
   *   com `transaction_id` = referência, o que impede duplicar a conversão se o
   *   cliente recarregar a página.
   *
   * Cartão recusado não gera nenhum dos dois: só entra no funil se o cliente
   * concluir pelo Pix.
   */
  const purchaseTracked = useRef("");
  const leadTracked = useRef("");
  useEffect(() => {
    if (!order || order.status === "card_declined") return;

    const items = order.items.map((item) => ({
      id: item.sku,
      name: item.name,
      price: item.unitPrice,
      quantity: item.quantity,
      variant: item.dosage,
    }));
    const paymentMethod =
      order.paymentMethod === "pix" ? "Pix" : "Cartão de crédito";
    const confirmed = order.status === "paid" || order.status === "shipped";

    if (confirmed) {
      if (purchaseTracked.current === order.reference) return;
      purchaseTracked.current = order.reference;
      trackPurchase({
        reference: order.reference,
        value: order.total,
        paymentMethod,
        items,
      });
      return;
    }

    // Pedido gerado, pagamento pendente ou apenas avisado pelo cliente.
    if (leadTracked.current === order.reference) return;
    leadTracked.current = order.reference;
    trackEvent("checkout_started", items, { payment_type: paymentMethod });
  }, [order]);

  const switchToPix = trpc.store.switchToPix.useMutation({
    onSuccess: () => {
      utils.store.getOrder.invalidate({ reference });
      toast.success("Pix gerado com o desconto do dia", {
        description: "Escaneie o QR Code ou copie o código para pagar.",
      });
    },
    onError: (error) =>
      toast.error("Não foi possível gerar o Pix", {
        description: error.message,
      }),
  });

  return (
    <div className="min-h-screen bg-rd-bg">
      <Header />

      <main className="mx-auto w-full max-w-[1100px] px-4 py-6 lg:px-6">
        {orderQuery.isLoading && (
          <div className="rounded-2xl bg-white p-8">
            <p className="flex items-center gap-2 text-[14px] text-rd-mute">
              <Loader2 size={16} className="animate-spin" /> Gerando seu
              pagamento...
            </p>
          </div>
        )}

        {orderQuery.error && (
          <div className="rounded-2xl bg-white p-8">
            <h1 className="text-[20px] font-bold text-rd-ink">
              Pedido não encontrado
            </h1>
            <p className="mt-2 text-[14px] text-rd-body">
              Não localizamos os dados deste pedido. Se você já finalizou a
              compra, entre em contato com a loja informando seu e-mail.
            </p>
            <Link
              href="/"
              className="rd-press mt-5 inline-block rounded-full bg-rd-action px-6 py-2.5 text-[14px] font-bold text-white hover:bg-rd-dark">
              Voltar ao produto
            </Link>
          </div>
        )}

        {order && isPix && (
          <>
            {/* Faixa de urgência */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-rd-dark px-5 py-3.5 text-white">
              <p className="flex items-center gap-2 text-[14px] font-bold">
                <Clock size={17} />
                {countdown.expired
                  ? "Tempo de reserva encerrado"
                  : `Reservamos seu pedido por ${countdown.label}`}
              </p>
              <p className="text-[13px] opacity-90">
                Pedido {order.reference} · {brl(order.total)}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
              {/* Coluna do QR Code */}
              <section className="rounded-2xl bg-white p-5 text-center lg:p-6">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[12px] font-bold text-emerald-700">
                  <BadgeCheck size={14} /> Falta só o pagamento
                </span>

                <h1 className="mt-3 text-[20px] font-bold text-rd-ink lg:text-[22px]">
                  Escaneie para pagar {brl(order.total)}
                </h1>

                <div className="mx-auto mt-4 w-full max-w-[300px] rounded-2xl border-2 border-rd-line2 p-3">
                  {qrDataUrl ? (
                    <img
                      src={qrDataUrl}
                      alt="QR Code para pagamento via Pix"
                      className="h-auto w-full" />
                  ) : (
                    <div className="flex aspect-square items-center justify-center">
                      <Loader2
                        size={22}
                        className="animate-spin text-rd-mute" />
                    </div>
                  )}
                </div>

                <button
                  onClick={copyCode}
                  className="rd-press mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-rd-action py-3.5 text-[15px] font-bold text-white hover:bg-rd-dark">
                  {copied ? (
                    <ClipboardCheck size={17} />
                  ) : (
                    <Clipboard size={17} />
                  )}
                  {copied ? "Código copiado!" : "Copiar código Pix"}
                </button>

                <p className="mt-2 text-[12px] text-rd-mute">
                  Não consegue escanear? Copie o código e cole no app do banco.
                </p>

                {/* Confirmação declarada pelo cliente. */}
                {(claimVisible || alreadyClaimed) && (
                  <div className="mt-4 border-t border-rd-line pt-4">
                    {alreadyClaimed ? (
                      <p className="flex items-center justify-center gap-2 rounded-xl bg-emerald-50 px-3 py-3 text-[13px] font-semibold text-emerald-700">
                        <CheckCheck size={16} />
                        Aviso de pagamento registrado
                      </p>
                    ) : (
                      <>
                        <button
                          onClick={() => claimPayment.mutate({ reference })}
                          disabled={claimPayment.isPending}
                          className="rd-press flex w-full items-center justify-center gap-2 rounded-full border-2 border-rd-green bg-white py-3 text-[15px] font-bold text-rd-green hover:bg-emerald-50 disabled:opacity-60">
                          {claimPayment.isPending ? (
                            <Loader2 size={17} className="animate-spin" />
                          ) : (
                            <CheckCheck size={17} />
                          )}
                          Já paguei
                        </button>
                        <p className="mt-2 text-[12px] text-rd-mute">
                          Clique após concluir o Pix para agilizar a liberação do
                          seu pedido.
                        </p>
                      </>
                    )}
                  </div>
                )}

                <details className="mt-3 text-left">
                  <summary className="cursor-pointer text-[12px] font-semibold text-rd-action">
                    Ver código Pix completo
                  </summary>
                  <div className="mt-2 max-h-24 overflow-auto break-all rounded-xl bg-rd-bg p-3 font-mono text-[11px] leading-relaxed text-rd-body">
                    {pixPayload}
                  </div>
                </details>
              </section>

              {/* Coluna de instruções e confiança */}
              <div className="flex flex-col gap-4">
                <section className="rounded-2xl bg-white p-5 lg:p-6">
                  <h2 className="text-[16px] font-bold text-rd-ink">
                    Pague em 3 passos
                  </h2>
                  <ol className="mt-3 space-y-3">
                    <Step
                      index={1}
                      icon={<Smartphone size={15} className="text-rd-action" />}
                      title="Abra o app do seu banco"
                      description="Entre na área Pix e escolha Pagar com QR Code ou Pix copia-e-cola." />
                    <Step
                      index={2}
                      icon={<Clipboard size={15} className="text-rd-action" />}
                      title="Escaneie ou cole o código"
                      description={`Confira se o valor exibido é de ${brl(order.total)} antes de confirmar.`} />
                    <Step
                      index={3}
                      icon={<Package size={15} className="text-rd-action" />}
                      title="Pronto, é automático"
                      description="Assim que o pagamento cair, seu pedido entra em separação e você recebe a confirmação por e-mail." />
                  </ol>
                </section>

                <section className="rounded-2xl bg-white p-5 lg:p-6">
                  <h2 className="text-[15px] font-bold text-rd-ink">
                    Resumo da compra
                  </h2>
                  <ul className="mt-2 space-y-1 text-[13px] text-rd-body">
                    {order.items.map((item) => (
                      <li key={item.sku} className="flex justify-between gap-4">
                        <span>
                          {item.quantity}x T.G {item.dosage}
                        </span>
                        <span className="font-semibold text-rd-ink">
                          {brl(
                            Math.round(item.unitPrice * item.quantity * 100) /
                              100,
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 flex items-baseline justify-between border-t border-rd-line pt-3">
                    <span className="text-[14px] font-bold text-rd-ink">
                      Total no Pix
                    </span>
                    <span className="text-[20px] font-extrabold text-rd-ink">
                      {brl(order.total)}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <p className="flex items-center gap-1.5 text-[12px] text-rd-body">
                      <Truck size={14} className="shrink-0 text-rd-green" />
                      Frete grátis
                    </p>
                    <p className="flex items-center gap-1.5 text-[12px] text-rd-body">
                      <Lock size={14} className="shrink-0 text-rd-green" />
                      Pagamento seguro
                    </p>
                    <p className="flex items-center gap-1.5 text-[12px] text-rd-body">
                      <BadgeCheck
                        size={14}
                        className="shrink-0 text-rd-green" />
                      Produto original
                    </p>
                  </div>
                </section>

                <section className="rounded-2xl border border-rd-line2 bg-white p-5">
                  <p className="flex items-start gap-2 text-[13px] text-rd-body">
                    <MessageCircle
                      size={16}
                      className="mt-0.5 shrink-0 text-rd-action" />
                    <span>
                      {alreadyClaimed ? (
                        <>
                          <b className="text-rd-ink">Estamos conferindo.</b> Seu
                          aviso foi registrado e a confirmação é feita em poucos
                          minutos. Guarde o código{" "}
                          <b className="text-rd-ink">{order.reference}</b> e o
                          comprovante do banco.
                        </>
                      ) : (
                        <>
                          <b className="text-rd-ink">Já pagou?</b> Copie o código
                          acima e toque em <b className="text-rd-ink">Já paguei</b>{" "}
                          para avisar nossa equipe. Guarde o código{" "}
                          <b className="text-rd-ink">{order.reference}</b> e o
                          comprovante do banco.
                        </>
                      )}
                    </span>
                  </p>
                </section>
              </div>
            </div>
          </>
        )}

        {order && !isPix && declined && (
          <div className="rounded-2xl bg-white p-6 lg:p-10">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-100">
              <XCircle size={26} className="text-rose-600" />
            </span>
            <h1 className="mt-4 text-[22px] font-bold text-rd-ink lg:text-[26px]">
              Pagamento não autorizado
            </h1>
            <p className="mt-2 text-[14px] text-rd-body">
              A operadora do{" "}
              <b className="text-rd-ink">
                {order.cardBrand ?? "cartão"}
                {order.cardLast4 ? ` terminado em ${order.cardLast4}` : ""}
              </b>{" "}
              recusou a cobrança de <b className="text-rd-ink">{brl(order.total)}</b>
              {order.installments > 1 ? ` em ${order.installments}x` : ""}. Nenhum
              valor foi debitado.
            </p>

            <div className="mt-5 rounded-2xl border border-rd-line2 bg-rd-bg p-4">
              <p className="text-[13px] font-bold text-rd-ink">
                Seu pedido {order.reference} está guardado
              </p>
              <p className="mt-1 text-[13px] text-rd-body">
                Não é preciso preencher nada novamente. Conclua no Pix para
                garantir o desconto e liberar a separação do pedido.
              </p>
              {pixTotal < order.total && (
                <p className="mt-2 text-[13px] font-semibold text-rd-green">
                  No Pix o pedido sai por {brl(pixTotal)} — você economiza{" "}
                  {brl(Math.round((order.total - pixTotal) * 100) / 100)}.
                </p>
              )}
            </div>

            <button
              onClick={() => switchToPix.mutate({ reference })}
              disabled={switchToPix.isPending}
              className="rd-press mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-rd-green py-3.5 text-[15px] font-extrabold text-white hover:brightness-95 disabled:opacity-70 sm:w-auto sm:px-8">
              {switchToPix.isPending ? (
                <Loader2 size={17} className="animate-spin" />
              ) : (
                <QrCode size={17} />
              )}
              Pagar no Pix e concluir o pedido
            </button>

            <ul className="mt-5 space-y-1 border-t border-rd-line pt-4 text-[13px] text-rd-body">
              {order.items.map((item) => (
                <li key={item.sku} className="flex justify-between gap-4">
                  <span>
                    {item.quantity}x T.G {item.dosage}
                  </span>
                  <span className="font-semibold text-rd-ink">
                    {brl(Math.round(item.unitPrice * item.quantity * 100) / 100)}
                  </span>
                </li>
              ))}
            </ul>

            <Link
              href="/"
              className="rd-press mt-6 inline-block rounded-full border border-rd-action px-6 py-2.5 text-[14px] font-bold text-rd-action hover:bg-rd-pink">
              Voltar ao produto
            </Link>
          </div>
        )}

        {order && !isPix && !declined && (
          <div className="rounded-2xl bg-white p-6 lg:p-10">
            <CheckCircle2 size={40} className="text-rd-green" />
            <h1 className="mt-4 text-[22px] font-bold text-rd-ink lg:text-[26px]">
              Pedido {order.reference} recebido
            </h1>
            <p className="mt-2 text-[14px] text-rd-body">
              Valor de <b className="text-rd-ink">{brl(order.total)}</b>
              {order.installments > 1
                ? ` em ${order.installments}x sem juros`
                : " à vista"}
              .
            </p>

            <div className="mt-5 flex items-start gap-3 rounded-2xl border border-rd-line2 p-4">
              <CreditCard size={20} className="mt-0.5 text-rd-action" />
              <div>
                <h2 className="text-[15px] font-bold text-rd-ink">
                  {order.cardBrand ?? "Cartão"}
                  {order.cardLast4 ? ` terminado em ${order.cardLast4}` : ""}
                </h2>
                <p className="mt-1 text-[13px] text-rd-body">
                  Estamos processando a autorização com a operadora. Você recebe
                  a confirmação por e-mail assim que for aprovada.
                </p>
              </div>
            </div>

            <ul className="mt-5 space-y-1 border-t border-rd-line pt-4 text-[13px] text-rd-body">
              {order.items.map((item) => (
                <li key={item.sku} className="flex justify-between gap-4">
                  <span>
                    {item.quantity}x T.G {item.dosage}
                  </span>
                  <span className="font-semibold text-rd-ink">
                    {brl(Math.round(item.unitPrice * item.quantity * 100) / 100)}
                  </span>
                </li>
              ))}
            </ul>

            <Link
              href="/"
              className="rd-press mt-6 inline-block rounded-full border border-rd-action px-6 py-2.5 text-[14px] font-bold text-rd-action hover:bg-rd-pink">
              Voltar ao produto
            </Link>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
