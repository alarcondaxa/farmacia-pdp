/**
 * Checkout em etapa única: dados básicos, endereço com busca automática por CEP
 * (ViaCEP via backend) e escolha entre Pix ou cartão em até 3x.
 *
 * O pedido é gravado no banco pelo procedimento `store.createOrder`, que também
 * devolve o Pix copia-e-cola gerado a partir da chave configurada no painel.
 */
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  ArrowLeft,
  BadgePercent,
  CreditCard,
  Loader2,
  QrCode,
  ShieldCheck,
  Timer,
  Truck,
} from "lucide-react";
import { toast } from "sonner";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CardForm, {
  emptyCard,
  validateCard,
  type CardData,
} from "@/components/CardForm";
import { useCart } from "@/contexts/CartContext";
import { useCustomerLocation } from "@/contexts/LocationContext";
import { product } from "@/data/product";
import { BRAND_LABEL, detectBrand, lastFour } from "@/lib/card";
import {
  DISCOUNT_LABEL,
  MAX_INSTALLMENTS,
  brl,
  discounted,
  endOfToday,
  formatCountdown,
} from "@/lib/pricing";
import { trackEvent } from "@/lib/tracking";
import { trpc } from "@/lib/trpc";

type PaymentMethod = "pix" | "card";

const onlyDigits = (v: string) => v.replace(/\D/g, "");

const maskCpf = (v: string) => {
  const d = onlyDigits(v).slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
};

const maskPhone = (v: string) => {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length <= 10)
    return d.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2");
  return d.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
};

const maskCep = (v: string) => {
  const d = onlyDigits(v).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
};

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  inputMode,
  className = "",
  required = true,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  inputMode?: "text" | "numeric" | "email" | "tel";
  className?: string;
  required?: boolean;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-[13px] font-semibold text-rd-body">
        {label}
        {required && <span className="text-rd-action"> *</span>}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type={type}
        inputMode={inputMode}
        className="w-full rounded-xl border border-rd-line2 bg-white px-3 py-2.5 text-[14px] text-rd-ink outline-none transition-colors focus:border-rd-action" />
    </label>
  );
}

export default function Checkout() {
  const { items, subtotal, listTotal, savings, clear } = useCart();
  const [, navigate] = useLocation();
  // Região informada no modal de entrada: já aproveitamos no endereço.
  const { location: customerLocation } = useCustomerLocation();

  const [form, setForm] = useState(() => ({
    name: "",
    email: "",
    cpf: "",
    phone: "",
    cep: customerLocation?.cep ?? "",
    address: customerLocation?.address ?? "",
    number: "",
    complement: "",
    district: customerLocation?.district ?? "",
    city: customerLocation?.city ?? "",
    state: customerLocation?.state ?? "",
  }));
  const [method, setMethod] = useState<PaymentMethod>("pix");
  const [card, setCard] = useState<CardData>(emptyCard);
  const [installments, setInstallments] = useState(1);
  const [remaining, setRemaining] = useState(
    () => endOfToday().getTime() - Date.now(),
  );

  useEffect(() => {
    const id = setInterval(
      () => setRemaining(endOfToday().getTime() - Date.now()),
      1000,
    );
    return () => clearInterval(id);
  }, []);

  const set = (key: keyof typeof form) => (v: string) =>
    setForm((f) => ({ ...f, [key]: v }));

  // Busca automática de endereço: dispara quando o CEP tem 8 dígitos.
  const cepDigits = onlyDigits(form.cep);
  const cepQuery = trpc.store.lookupCep.useQuery(
    { cep: cepDigits },
    { enabled: cepDigits.length === 8, retry: false, staleTime: 60 * 60 * 1000 },
  );

  useEffect(() => {
    if (!cepQuery.data) return;
    const found = cepQuery.data;
    setForm((f) => ({
      ...f,
      address: found.address || f.address,
      district: found.district || f.district,
      city: found.city || f.city,
      state: found.state || f.state,
    }));
  }, [cepQuery.data]);

  useEffect(() => {
    if (cepQuery.error) {
      toast.error(cepQuery.error.message || "Não foi possível consultar o CEP");
    }
  }, [cepQuery.error]);

  const createOrder = trpc.store.createOrder.useMutation();

  // Conversão: início de checkout. Dispara uma vez ao abrir a página, cobrindo
  // também quem chega direto pela URL (sem passar pelo carrinho).
  const checkoutTracked = useRef(false);
  useEffect(() => {
    if (checkoutTracked.current || items.length === 0) return;
    checkoutTracked.current = true;
    trackEvent(
      "begin_checkout",
      items.map((i) => ({
        id: `${product.sku}-${i.dosage}`,
        name: `${product.name} ${i.dosage}`,
        price: discounted(product.dosagePrices[i.dosage].to),
        quantity: i.qty,
        variant: i.dosage,
      })),
    );
  }, [items]);

  // Disponibilidade real por dosagem, para o cliente ver no resumo o mesmo
  // número que o servidor valida ao criar o pedido.
  const availability = trpc.store.availability.useQuery(undefined, {
    staleTime: 15_000,
  });

  /** Estoque do servidor para uma dosagem (undefined = sem controle). */
  const stockFor = (dosage: string) =>
    availability.data?.stock.find(
      (s: { dosage: string }) => s.dosage === dosage,
    );

  // Itens do carrinho que excedem o disponível ou estão esgotados.
  const blockedItems = items.filter((i) => {
    const stock = stockFor(i.dosage);
    return stock ? i.qty > stock.available : false;
  });
  const sending = createOrder.isPending;

  // Pix leva o desconto do dia; no cartão o pedido volta ao valor de tabela.
  // `total` acompanha o método escolhido para que o resumo, o CTA e o valor
  // enviado ao servidor nunca divirjam.
  const pixTotal = subtotal;
  const total = method === "card" ? listTotal : pixTotal;

  const missing = () => {
    const required: (keyof typeof form)[] = [
      "name",
      "email",
      "cpf",
      "phone",
      "cep",
      "address",
      "number",
      "district",
      "city",
      "state",
    ];
    return required.filter((k) => !form[k].trim());
  };

  const submit = async () => {
    if (items.length === 0) {
      toast.error("Seu carrinho está vazio.");
      return;
    }
    if (missing().length > 0) {
      toast.error("Preencha todos os campos obrigatórios.");
      return;
    }
    if (onlyDigits(form.cpf).length !== 11) {
      toast.error("Informe um CPF válido com 11 dígitos.");
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) {
      toast.error("Informe um e-mail válido.");
      return;
    }

    if (method === "card") {
      const cardError = validateCard(card);
      if (cardError) {
        toast.error(cardError);
        return;
      }
    }

    await submitOrder(method);
  };

  const submitOrder = async (paymentMethod: PaymentMethod) => {
    try {
      const brand = paymentMethod === "card" ? detectBrand(card.number) : null;
      // No cartão o desconto do Pix não se aplica: o item vai pelo preço de
      // tabela, igual ao que a tela mostra ao cliente.
      const priceFor = (dosage: string) =>
        paymentMethod === "card"
          ? product.dosagePrices[dosage].from
          : discounted(product.dosagePrices[dosage].to);

      // Conversão: forma de pagamento escolhida (antes da resposta do servidor,
      // para não perder o evento se o cliente fechar a aba na sequência).
      trackEvent(
        "add_payment_info",
        items.map((i) => ({
          id: `${product.sku}-${i.dosage}`,
          name: `${product.name} ${i.dosage}`,
          price: priceFor(i.dosage),
          quantity: i.qty,
          variant: i.dosage,
        })),
        { payment_type: paymentMethod === "pix" ? "Pix" : "Cartão de crédito" },
      );

      const order = await createOrder.mutateAsync({
        customerName: form.name.trim(),
        email: form.email.trim(),
        cpf: form.cpf,
        phone: form.phone,
        cep: form.cep,
        address: form.address.trim(),
        number: form.number.trim(),
        complement: form.complement.trim() || undefined,
        district: form.district.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        paymentMethod,
        installments: paymentMethod === "card" ? installments : 1,
        // Apenas dados não sensíveis: número completo, validade e CVV nunca
        // saem do navegador (regras PCI-DSS).
        cardBrand:
          paymentMethod === "card" && brand
            ? BRAND_LABEL[brand].slice(0, 20)
            : undefined,
        cardLast4:
          paymentMethod === "card" ? lastFour(card.number) : undefined,
        cardHolder:
          paymentMethod === "card" ? card.holder.trim().slice(0, 120) : undefined,
        items: items.map((i) => ({
          sku: `${product.sku}-${i.dosage}`,
          name: `${product.name} ${i.dosage}`,
          dosage: i.dosage,
          quantity: i.qty,
          unitPrice: priceFor(i.dosage),
          listPrice: product.dosagePrices[i.dosage].from,
          image: product.dosageImages[i.dosage],
        })),
      });

      clear();
      // O cartão não é autorizado por este site: o pedido fica salvo e a tela de
      // confirmação mostra a recusa com a opção de pagar no Pix.
      navigate(
        order.declined
          ? `/pedido-confirmado?ref=${order.reference}&recusado=1`
          : `/pedido-confirmado?ref=${order.reference}`,
      );
    } catch (error) {
      toast.error("Não foi possível finalizar o pedido", {
        description:
          error instanceof Error ? error.message : "Tente novamente em instantes.",
      });
    }
  };

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-rd-bg">
        <Header />
        <main className="mx-auto w-full max-w-[1366px] px-4 py-10 lg:px-6">
          <div className="rounded-2xl bg-white p-8">
            <h1 className="text-[20px] font-bold text-rd-ink">
              Não há itens para finalizar
            </h1>
            <p className="mt-2 text-[14px] text-rd-mute">
              Adicione o produto ao carrinho para continuar.
            </p>
            <Link
              href="/"
              className="rd-press mt-4 inline-block rounded-full bg-rd-action px-6 py-2.5 text-[14px] font-bold text-white hover:bg-rd-dark">
              Voltar ao produto
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-rd-bg">
      <Header />

      <main className="mx-auto w-full max-w-[1366px] px-4 pb-10 lg:px-6">
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-rd-action px-4 py-3 text-white">
          <p className="flex items-center gap-2 text-[13.5px] font-extrabold">
            <Timer size={16} className="shrink-0" />
            Desconto de {DISCOUNT_LABEL} reservado por{" "}
            <span className="tabular-nums">{formatCountdown(remaining)}</span>
          </p>
          <p className="text-[12.5px] opacity-95">
            Economia de {brl(savings)} garantida ao concluir agora
          </p>
        </div>

        <div className="py-4">
          <Link
            href="/carrinho"
            className="rd-press flex items-center gap-1.5 text-[13px] font-semibold text-rd-body hover:text-rd-dark">
            <ArrowLeft size={15} /> Voltar ao carrinho
          </Link>
        </div>

        <h1 className="mb-4 text-[22px] font-bold text-rd-ink lg:text-[26px]">
          Finalizar compra
        </h1>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
          <div className="flex flex-col gap-6">
            {/* Dados do cliente */}
            <section className="rounded-2xl bg-white p-4 lg:p-6">
              <h2 className="mb-4 text-[16px] font-bold text-rd-ink">
                1. Seus dados
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field
                  label="Nome completo"
                  value={form.name}
                  onChange={set("name")}
                  placeholder="Como no documento"
                  className="sm:col-span-2" />
                <Field
                  label="E-mail"
                  value={form.email}
                  onChange={set("email")}
                  placeholder="voce@email.com"
                  type="email"
                  inputMode="email" />
                <Field
                  label="Telefone"
                  value={form.phone}
                  onChange={(v) => set("phone")(maskPhone(v))}
                  placeholder="(11) 90000-0000"
                  inputMode="tel" />
                <Field
                  label="CPF"
                  value={form.cpf}
                  onChange={(v) => set("cpf")(maskCpf(v))}
                  placeholder="000.000.000-00"
                  inputMode="numeric" />
              </div>
            </section>

            {/* Endereço */}
            <section className="rounded-2xl bg-white p-4 lg:p-6">
              <h2 className="mb-4 text-[16px] font-bold text-rd-ink">
                2. Endereço de entrega
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
                <Field
                  label="CEP"
                  value={form.cep}
                  onChange={(v) => set("cep")(maskCep(v))}
                  placeholder="00000-000"
                  inputMode="numeric"
                  className="sm:col-span-2" />
                <Field
                  label="Endereço"
                  value={form.address}
                  onChange={set("address")}
                  placeholder="Rua, avenida..."
                  className="sm:col-span-4" />
                <Field
                  label="Número"
                  value={form.number}
                  onChange={set("number")}
                  placeholder="123"
                  inputMode="numeric"
                  className="sm:col-span-2" />
                <Field
                  label="Complemento"
                  value={form.complement}
                  onChange={set("complement")}
                  placeholder="Apto, bloco (opcional)"
                  required={false}
                  className="sm:col-span-4" />
                <Field
                  label="Bairro"
                  value={form.district}
                  onChange={set("district")}
                  className="sm:col-span-2" />
                <Field
                  label="Cidade"
                  value={form.city}
                  onChange={set("city")}
                  className="sm:col-span-3" />
                <Field
                  label="UF"
                  value={form.state}
                  onChange={(v) => set("state")(v.toUpperCase().slice(0, 2))}
                  placeholder="SP"
                  className="sm:col-span-1" />
              </div>
              {cepQuery.isFetching && (
                <p className="mt-3 flex items-center gap-2 text-[12px] text-rd-mute">
                  <Loader2 size={13} className="animate-spin" />
                  Buscando endereço pelo CEP...
                </p>
              )}
              <div className="mt-4 flex items-start gap-2 rounded-xl bg-rd-bg p-3">
                <Truck size={18} className="mt-0.5 shrink-0 text-rd-green" />
                <p className="text-[12px] text-rd-body">
                  <b className="text-rd-green">Frete grátis</b> para todo o
                  Brasil. Enviamos para todos os estados sem custo adicional.
                </p>
              </div>
            </section>

            {/* Pagamento */}
            <section className="rounded-2xl bg-white p-4 lg:p-6">
              <h2 className="mb-4 text-[16px] font-bold text-rd-ink">
                3. Pagamento
              </h2>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  onClick={() => setMethod("pix")}
                  className={`rd-press relative flex items-start gap-3 rounded-2xl border p-4 text-left transition-colors ${
                    method === "pix"
                      ? "border-rd-action bg-rd-pink"
                      : "border-rd-line2 hover:border-rd-action"
                  }`}>
                  <span className="absolute -top-2 right-3 rounded-full bg-rd-green px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                    Recomendado
                  </span>
                  <QrCode
                    size={22}
                    className={
                      method === "pix" ? "text-rd-action" : "text-rd-mute"
                    } />
                  <span>
                    <span className="block text-[14px] font-bold text-rd-ink">
                      Pix
                    </span>
                    <span className="block text-[12px] text-rd-mute">
                      Liberação imediata · {brl(pixTotal)}
                    </span>
                  </span>
                </button>

                <button
                  onClick={() => setMethod("card")}
                  className={`rd-press flex items-start gap-3 rounded-2xl border p-4 text-left transition-colors ${
                    method === "card"
                      ? "border-rd-action bg-rd-pink"
                      : "border-rd-line2 hover:border-rd-action"
                  }`}>
                  <CreditCard
                    size={22}
                    className={
                      method === "card" ? "text-rd-action" : "text-rd-mute"
                    } />
                  <span>
                    <span className="block text-[14px] font-bold text-rd-ink">
                      Cartão de crédito
                    </span>
                    <span className="block text-[12px] text-rd-mute">
                      Em até {MAX_INSTALLMENTS}x sem juros
                    </span>
                  </span>
                </button>
              </div>

              {method === "card" && (
                <div className="mt-4 rounded-2xl border border-rd-green bg-emerald-50 p-4">
                  <p className="flex items-center gap-2 text-[14px] font-bold text-emerald-800">
                    <BadgePercent size={17} />
                    O desconto de {DISCOUNT_LABEL} é exclusivo do Pix
                  </p>
                  <p className="mt-2 text-[13px] text-emerald-800">
                    No cartão o pedido volta ao valor de{" "}
                    <b>{brl(listTotal)}</b>. Pagando no Pix você leva por{" "}
                    <b>{brl(pixTotal)}</b> e economiza{" "}
                    <b>{brl(savings)}</b> agora.
                  </p>

                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="rounded-xl bg-white p-3">
                      <p className="text-[11px] uppercase tracking-wide text-rd-mute">
                        No cartão
                      </p>
                      <p className="mt-0.5 text-[16px] font-bold text-rd-mute line-through">
                        {brl(listTotal)}
                      </p>
                      <p className="text-[11px] text-rd-mute">
                        até {MAX_INSTALLMENTS}x de {brl(listTotal / MAX_INSTALLMENTS)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-rd-green bg-white p-3">
                      <p className="text-[11px] uppercase tracking-wide text-rd-green">
                        No Pix hoje
                      </p>
                      <p className="mt-0.5 text-[18px] font-extrabold text-rd-ink">
                        {brl(pixTotal)}
                      </p>
                      <p className="text-[11px] font-semibold text-rd-green">
                        {DISCOUNT_LABEL} de desconto à vista
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => setMethod("pix")}
                    className="rd-press mt-3 w-full rounded-full bg-rd-green py-2.5 text-[14px] font-bold text-white hover:brightness-95">
                    Quero pagar no Pix e garantir o desconto
                  </button>
                </div>
              )}

              {method === "card" && (
                <div className="mt-4">
                  <CardForm card={card} onChange={setCard} />

                  <div className="mt-4">
                    <p className="mb-2 text-[13px] font-semibold text-rd-ink">
                      Parcelamento
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {Array.from({ length: MAX_INSTALLMENTS }, (_, i) => i + 1).map(
                        (n) => (
                          <button
                            key={n}
                            onClick={() => setInstallments(n)}
                            className={`rd-press rounded-xl border p-2.5 text-center transition-colors ${
                              installments === n
                                ? "border-rd-action bg-rd-pink"
                                : "border-rd-line2 hover:border-rd-action"
                            }`}>
                            <span className="block text-[13px] font-bold text-rd-ink">
                              {n}x
                            </span>
                            <span className="block text-[11px] text-rd-mute">
                              {brl(listTotal / n)}
                            </span>
                          </button>
                        ),
                      )}
                    </div>
                    <p className="mt-2 text-[12px] text-rd-mute">
                      Total no cartão: <b>{brl(listTotal)}</b> em {installments}x
                      sem juros
                    </p>
                  </div>
                </div>
              )}

              {method === "pix" && (
                <div className="mt-4 rounded-2xl bg-rd-bg p-4">
                  <p className="text-[13px] font-bold text-rd-ink">
                    Como funciona
                  </p>
                  <ol className="mt-2 space-y-1.5 text-[13px] text-rd-body">
                    <li>
                      <b>1.</b> Confirme o pedido e receba o QR Code na hora.
                    </li>
                    <li>
                      <b>2.</b> Pague pelo app do seu banco em poucos segundos.
                    </li>
                    <li>
                      <b>3.</b> A separação do pedido começa após a confirmação.
                    </li>
                  </ol>
                </div>
              )}
            </section>
          </div>

          {/* Resumo */}
          <aside className="h-fit rounded-2xl bg-white p-4 lg:sticky lg:top-40 lg:p-6">
            <h2 className="mb-4 text-[16px] font-bold text-rd-ink">
              Resumo do pedido
            </h2>

            <ul className="mb-4 space-y-3">
              {items.map((i) => {
                const stock = stockFor(i.dosage);
                const exceeded = stock ? i.qty > stock.available : false;
                // Preço unitário coerente com o método escolhido.
                const unit =
                  method === "card"
                    ? product.dosagePrices[i.dosage].from
                    : discounted(product.dosagePrices[i.dosage].to);

                return (
                  <li key={i.dosage} className="flex items-center gap-3">
                    <img
                      src={product.dosageImages[i.dosage]}
                      alt=""
                      className="h-14 w-14 shrink-0 rounded-lg border border-rd-line object-contain p-1" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-rd-ink">
                        T.G {i.dosage}
                      </p>
                      <p className="text-[12px] text-rd-mute">
                        {i.qty}x {brl(unit)}
                      </p>
                      {stock && (
                        <p
                          className={`mt-0.5 text-[11.5px] font-semibold ${
                            exceeded ? "text-rose-600" : "text-rd-action"
                          }`}>
                          {stock.available === 0
                            ? "Esgotado nesta promoção"
                            : exceeded
                              ? `Restam apenas ${stock.available} em estoque`
                              : `${stock.available} em estoque`}
                        </p>
                      )}
                    </div>
                    <p className="text-[13px] font-bold text-rd-ink">
                      {brl(Math.round(unit * i.qty * 100) / 100)}
                    </p>
                  </li>
                );
              })}
            </ul>

            {blockedItems.length > 0 && (
              <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3">
                <p className="text-[12.5px] font-semibold text-rose-700">
                  Ajuste seu carrinho para continuar
                </p>
                <p className="mt-0.5 text-[12px] text-rose-700/80">
                  {blockedItems
                    .map((i) => {
                      const stock = stockFor(i.dosage);
                      return stock?.available === 0
                        ? `${i.dosage} está esgotado`
                        : `${i.dosage} tem apenas ${stock?.available} unidade(s)`;
                    })
                    .join(" · ")}
                  .
                </p>
              </div>
            )}

            <dl className="space-y-2 border-t border-rd-line pt-3 text-[14px]">
              <div className="flex justify-between text-rd-body">
                <dt>Subtotal</dt>
                <dd className={method === "card" ? "" : "line-through"}>
                  {brl(listTotal)}
                </dd>
              </div>
              {method === "pix" ? (
                <div className="flex justify-between text-rd-green">
                  <dt>Desconto de hoje ({DISCOUNT_LABEL})</dt>
                  <dd>-{brl(savings)}</dd>
                </div>
              ) : (
                <div className="flex justify-between text-rd-mute">
                  <dt>Desconto de hoje ({DISCOUNT_LABEL})</dt>
                  <dd>Somente no Pix</dd>
                </div>
              )}
              <div className="flex justify-between text-rd-body">
                <dt>Frete</dt>
                <dd className="font-bold text-rd-green">Grátis</dd>
              </div>
              <div className="flex items-baseline justify-between border-t border-rd-line pt-3">
                <dt className="text-[15px] font-bold text-rd-ink">Total</dt>
                <dd className="text-[22px] font-extrabold text-rd-ink">
                  {brl(total)}
                </dd>
              </div>
            </dl>

            <p className="mt-1 text-[12px] text-rd-mute">
              {method === "pix"
                ? "Pagamento à vista no Pix"
                : `${installments}x de ${brl(
                    Math.round((listTotal / installments) * 100) / 100,
                  )} sem juros — no Pix sairia ${brl(pixTotal)}`}
            </p>

            <button
              onClick={submit}
              disabled={sending || blockedItems.length > 0}
              className="rd-press mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-rd-action py-3 text-[15px] font-bold text-white hover:bg-rd-dark disabled:opacity-70">
              {sending && <Loader2 size={16} className="animate-spin" />}
              {method === "pix"
                ? "Gerar Pix e finalizar"
                : `Pagar ${brl(total)} no cartão`}
            </button>

            <p className="mt-3 flex items-start gap-2 text-[12px] text-rd-mute">
              <ShieldCheck size={15} className="mt-px shrink-0 text-rd-green" />
              Seus dados são usados apenas para emissão e entrega do pedido.
            </p>
          </aside>
        </div>
      </main>

      <Footer />
    </div>
  );
}
