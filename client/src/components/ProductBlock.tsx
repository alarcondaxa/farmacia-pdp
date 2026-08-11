/**
 * RÉPLICA — bloco principal da PDP (galeria + info + coluna de preço).
 * Card branco raio 16px sobre fundo #F2F2F2; preço em #303030, "de" riscado em #6B6B6B;
 * botão comprar pill #B6202F. Caixas legais usam .legal-box (idêntico ao inline style original).
 */
import { useEffect, useState } from "react";
import {
  Beaker,
  BadgeCheck,
  Check,
  ChevronRight,
  Eye,
  Flame,
  Home,
  Lock,
  MapPin,
  Microscope,
  Minus,
  Plus,
  Pill,
  RefreshCcw,
  ShieldCheck,
  Snowflake,
  Timer,
  Truck,
} from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { product } from "@/data/product";
import { useCart } from "@/contexts/CartContext";
import { useCustomerLocation } from "@/contexts/LocationContext";
import { trpc } from "@/lib/trpc";
import { trackEvent } from "@/lib/tracking";
import {
  DISCOUNT_LABEL,
  MAX_INSTALLMENTS,
  brl,
  discounted,
  endOfToday,
  formatCountdown,
} from "@/lib/pricing";

const demo = () =>
  toast("Promoção válida somente para essa página", {
    description:
      "Ao sair dela você perde o desconto, continue para comprar.",
  });

function Breadcrumb() {
  return (
    <nav className="flex flex-wrap items-center gap-1 px-1 py-3 text-[12px] text-rd-mute">
      <Home size={13} />
      {product.breadcrumb.map((b) => (
        <span key={b} className="flex items-center gap-1">
          <button onClick={demo} className="hover:text-rd-dark hover:underline">
            {b}
          </button>
          <ChevronRight size={12} className="text-rd-line2" />
        </span>
      ))}
      <span className="max-w-full truncate font-semibold text-rd-body">
        {product.name}
      </span>
    </nav>
  );
}

export default function ProductBlock() {
  const [dosage, setDosage] = useState(product.dosage);
  const [qty, setQty] = useState(1);
  const [remaining, setRemaining] = useState(
    () => endOfToday().getTime() - Date.now(),
  );
  // Número de pessoas vendo a página: varia levemente para parecer vivo, sem
  // inventar dados de vendas ou avaliações.
  const [watching, setWatching] = useState(23);
  const { addItem, items } = useCart();
  // CEP informado na entrada: usamos para dizer que o estoque é da região dele.
  const { location: customerLocation, label: regionLabel } =
    useCustomerLocation();
  const regionSuffix = regionLabel ? ` perto de você em ${regionLabel}` : "";
  const [, navigate] = useLocation();

  // Disponibilidade real vinda do servidor: é o mesmo número que o checkout
  // valida na hora de criar o pedido.
  const availability = trpc.store.availability.useQuery(undefined, {
    staleTime: 30_000,
  });

  // Contador da promoção válida somente hoje
  useEffect(() => {
    const id = setInterval(
      () => setRemaining(endOfToday().getTime() - Date.now()),
      1000,
    );
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      setWatching((n) => {
        const next = n + (Math.random() > 0.5 ? 1 : -1);
        return Math.min(38, Math.max(14, next));
      });
    }, 5000);
    return () => clearInterval(id);
  }, []);

  // Preço muda conforme a dosagem selecionada (tabela em data/product.ts)
  const selected = product.dosagePrices[dosage];
  const unitPrice = discounted(selected.to);
  const total = Math.round(unitPrice * qty * 100) / 100;
  const installment = total / MAX_INSTALLMENTS;
  // A foto da embalagem também segue a dosagem escolhida
  const mainImage = product.dosageImages[dosage];
  // Unidades restantes no lote promocional da dosagem escolhida. Enquanto a
  // consulta ao servidor não responde, usa o valor de data/product.ts como
  // ponto de partida para a página não piscar.
  const fallback = product.dosageStock[dosage] ?? { left: 8, lot: 16 };
  const serverStock = availability.data?.stock.find(
    (s: { dosage: string }) => s.dosage === dosage,
  );
  const promoStock = serverStock?.available ?? fallback.left;
  const promoLot = serverStock?.lot ?? fallback.lot;
  const soldOut = promoStock <= 0;
  // O que já está no carrinho desta dosagem também consome o lote: sem isso,
  // cliques repetidos em "adicionar" somariam acima do estoque real.
  const inCart = items.find((i) => i.dosage === dosage)?.qty ?? 0;
  const remainingForCart = Math.max(0, promoStock - inCart);
  const cartFull = !soldOut && remainingForCart === 0;
  // Nunca deixa escolher mais unidades do que ainda cabem no lote promocional.
  const maxQty = Math.max(1, Math.min(10, remainingForCart || 1));

  // Se o estoque diminuir (outra compra) enquanto a página está aberta,
  // reduz a quantidade escolhida para um valor ainda válido.
  useEffect(() => {
    setQty(current => Math.min(current, maxQty));
  }, [maxQty]);

  // Conversão: visualização do produto (Meta ViewContent / GA4 view_item).
  // Dispara a cada troca de dosagem, que na prática é outro item do catálogo.
  useEffect(() => {
    trackEvent("view_item", [
      {
        id: `${product.sku}-${dosage}`,
        name: `${product.name} ${dosage}`,
        price: discounted(product.dosagePrices[dosage].to),
        quantity: 1,
        variant: dosage,
      },
    ]);
  }, [dosage]);

  const addToCart = (goToCart: boolean) => {
    if (soldOut) {
      toast.error(`A dosagem ${dosage} está esgotada nesta promoção`, {
        description: "Escolha outra dosagem para continuar.",
      });
      return;
    }

    if (cartFull) {
      // O cliente já reservou todo o lote desta dosagem. Não há o que somar,
      // mas o "Comprar agora" precisa seguir para o carrinho — travar aqui
      // deixaria o botão sem resposta.
      const label =
        promoStock === 1
          ? `Você já tem a única unidade disponível de ${dosage}`
          : `Você já tem as ${promoStock} unidades disponíveis de ${dosage}`;
      toast.info(label, {
        description: goToCart
          ? "Levando você para o carrinho para finalizar."
          : "Esse é o limite do lote promocional nesta dosagem.",
      });
      if (goToCart) navigate("/carrinho");
      return;
    }

    const added = addItem(dosage, qty);

    if (added < qty) {
      toast.warning(
        added === 0
          ? `Estoque de ${dosage} esgotado para este carrinho`
          : `Adicionamos apenas ${added} unidade(s) de ${dosage}`,
        { description: `O estoque disponível é de ${promoStock} unidade(s).` },
      );
      if (added === 0) {
        // Mesmo sem adicionar nada, o fluxo de compra continua para o carrinho.
        if (goToCart) navigate("/carrinho");
        return;
      }
    }

    // Conversão: adição ao carrinho com a quantidade efetivamente aceita.
    // Fica antes da navegação para valer também no "Comprar agora".
    trackEvent("add_to_cart", [
      {
        id: `${product.sku}-${dosage}`,
        name: `${product.name} ${dosage}`,
        price: unitPrice,
        quantity: added,
        variant: dosage,
      },
    ]);

    if (goToCart) {
      navigate("/carrinho");
      return;
    }

    toast.success("Produto adicionado ao carrinho", {
      description: `${added}x T.G ${dosage} — ${brl(Math.round(unitPrice * added * 100) / 100)}`,
    });
  };

  return (
    <>
      <Breadcrumb />

      <div className="grid grid-cols-1 gap-6 rounded-2xl bg-white p-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)_minmax(0,320px)] lg:gap-8 lg:p-6">
      {/* Galeria */}
        <div className="flex min-w-0 flex-col gap-3">
          <div className="relative flex items-center justify-center overflow-hidden rounded-2xl border border-rd-line bg-white p-4">
            {/* Selo circular de desconto, mais chamativo que a pílula rosa */}
            <span className="absolute top-3 left-3 z-10 flex h-16 w-16 flex-col items-center justify-center rounded-full bg-rd-action text-white shadow-lg shadow-rd-action/30">
              <b className="text-[19px] leading-none font-extrabold">
                {DISCOUNT_LABEL}
              </b>
              <span className="text-[10px] leading-none font-bold tracking-wide">
                OFF
              </span>
            </span>
            <span className="absolute top-3 right-3 z-10 flex items-center gap-1 rounded-full bg-rd-bg px-2.5 py-1 text-[11px] font-bold text-rd-body">
              <Eye size={12} /> {watching} vendo agora
            </span>
            <img
              src={mainImage}
              alt={`${product.name} — ${dosage}`}
              className="h-[280px] w-full object-contain lg:h-[320px]" />
          </div>
          <div className="rd-scroll flex gap-2 overflow-x-auto pb-1">
            {product.dosageOptions.map((d) => (
              <button
                key={d}
                onClick={() => setDosage(d)}
                title={`Ver embalagem ${d}`}
                className={`rd-press h-16 w-16 shrink-0 overflow-hidden rounded-xl border bg-white p-1 ${
                  d === dosage ? "border-rd-action" : "border-rd-line2"
                }`}>
                <img
                  src={product.dosageImages[d]}
                  alt={`Embalagem T.G ${d}`}
                  loading="lazy"
                  className="h-full w-full object-contain" />
              </button>
            ))}
          </div>
        </div>

        {/* Info central */}
        <div className="min-w-0">
          <h1 className="text-[20px] leading-tight font-bold text-rd-ink lg:text-[24px]">
            {product.name}
          </h1>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-rd-mute">
            <span className="flex items-center gap-1.5">
              <Microscope size={14} /> Marca{" "}
              <b className="text-rd-body">{product.brand}</b>
            </span>
            <span className="flex items-center gap-1.5">
              <Pill size={14} /> Quantidade{" "}
              <b className="text-rd-body">{product.quantity}</b>
            </span>
            <span className="flex items-center gap-1.5">
              <Beaker size={14} /> Princípio Ativo{" "}
              <b className="text-rd-body">{product.activeIngredient}</b>
            </span>
          </div>

          <p className="mt-2 text-[13px] text-rd-mute">
            Vendido e entregue por <b className="text-rd-body">{product.seller}</b>
          </p>

          {/* Tarja de geladeira / controlado */}
          <div className="mt-4 flex items-start gap-3 rounded-2xl bg-rd-pink p-3">
            <Snowflake size={20} className="mt-0.5 shrink-0 text-rd-action" />
            <div>
              <p className="text-[14px] font-bold text-rd-dark">
                {product.coldChainTitle}
              </p>
              <p className="text-[13px] text-rd-body">
                {product.coldChainSubtitle}
              </p>
            </div>
          </div>

          {/* Seletor de dosagem */}
          <div className="mt-5">
            <p className="mb-2 text-[13px] text-rd-body">
              Dosagem: <b className="text-rd-ink">{dosage}</b>
            </p>
            <div className="flex flex-wrap gap-2">
              {product.dosageOptions.map((d) => {
                const dStock = availability.data?.stock.find(
                  (s: { dosage: string }) => s.dosage === d,
                );
                const dSoldOut = dStock ? dStock.available <= 0 : false;
                const dLow = dStock ? dStock.available > 0 && dStock.available <= 3 : false;

                return (
                  <button
                    key={d}
                    onClick={() => setDosage(d)}
                    className={`rd-press relative flex flex-col items-center rounded-xl border px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                      d === dosage
                        ? "border-rd-action bg-rd-pink text-rd-dark"
                        : "border-rd-line2 text-rd-body hover:border-rd-action"
                    } ${dSoldOut ? "opacity-55" : ""}`}>
                    {dLow && (
                      <span className="absolute -top-2 right-1 rounded-full bg-rd-action px-1.5 py-0.5 text-[9px] font-bold text-white">
                        {dStock?.available}
                      </span>
                    )}
                    {d}
                    <span className="text-[11px] font-bold text-rd-action">
                      {brl(discounted(product.dosagePrices[d].to))}
                    </span>
                    <span className="text-[10px] text-rd-mute line-through">
                      {brl(product.dosagePrices[d].to)}
                    </span>
                    {dSoldOut && (
                      <span className="text-[9.5px] font-bold tracking-wide text-rd-mute uppercase">
                        Esgotado
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Seletor de quantidade */}
          <div className="mt-5">
            <p className="mb-2 text-[13px] text-rd-body">
              Quantidade: <b className="text-rd-ink">{qty}</b>{" "}
              {qty > 1 ? "unidades" : "unidade"}
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-1 rounded-full border border-rd-line2 p-1">
                <button
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  disabled={qty <= 1}
                  aria-label="Diminuir quantidade"
                  className="rd-press rounded-full p-2 text-rd-action hover:bg-rd-pink disabled:cursor-not-allowed disabled:text-rd-line2 disabled:hover:bg-transparent">
                  <Minus size={16} />
                </button>
                <span className="w-9 text-center text-[15px] font-bold text-rd-ink">
                  {qty}
                </span>
                <button
                  onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
                  disabled={qty >= maxQty}
                  aria-label="Aumentar quantidade"
                  className="rd-press rounded-full p-2 text-rd-action hover:bg-rd-pink disabled:cursor-not-allowed disabled:text-rd-line2 disabled:hover:bg-transparent">
                  <Plus size={16} />
                </button>
              </div>
              <p className="text-[13px] text-rd-body">
                Total:{" "}
                <b className="text-[17px] text-rd-ink">{brl(total)}</b>
                <span className="ml-2 text-[12px] text-rd-mute line-through">
                  {brl(selected.to * qty)}
                </span>
              </p>
            </div>
            {cartFull && (
              <p className="mt-2 text-[12px] font-semibold text-rd-action">
                {promoStock === 1
                  ? `Você já tem a única unidade de ${dosage} no carrinho.`
                  : `Você já tem as ${promoStock} unidades de ${dosage} no carrinho.`}{" "}
                Use <b>Comprar agora</b> para finalizar.
              </p>
            )}
            {!cartFull && qty >= maxQty && maxQty > 1 && (
              <p className="mt-2 text-[12px] font-semibold text-rd-action">
                Limite de {maxQty} unidades por pedido nesta dosagem
                {inCart > 0 ? ` (${inCart} já no carrinho)` : ""}.
              </p>
            )}
            {qty === 1 && maxQty >= 2 && (
              <button
                onClick={() => setQty(2)}
                className="rd-press mt-3 flex w-full items-center gap-2 rounded-xl border border-dashed border-rd-action bg-rd-pink/50 px-3 py-2.5 text-left sm:w-auto">
                <Plus size={15} className="shrink-0 text-rd-action" />
                <span className="text-[12.5px] leading-tight text-rd-dark">
                  <b>Leve 2 unidades</b> e economize{" "}
                  <b>{brl((selected.to - unitPrice) * 2)}</b> — o tratamento
                  costuma durar mais de um mês.
                </span>
              </button>
            )}
          </div>

          {/* Bullets curtos */}
          <ul className="mt-5 space-y-1.5">
            {product.highlights.map((h) => (
              <li
                key={h}
                className="flex gap-2 text-[14px] leading-snug text-rd-body">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-rd-action" />
                {h}
              </li>
            ))}
          </ul>

          {product.legalBoxes.map((t) => (
            <p key={t} className="legal-box">
              {t}
            </p>
          ))}

          <div className="flex gap-3">
            <a
              href="#descricao"
              className="rd-press rounded-full border border-rd-line2 px-4 py-2 text-[13px] font-semibold text-rd-body hover:bg-rd-pink hover:text-rd-dark">
              Descrição completa
            </a>
            <a
              href="#bula"
              className="rd-press rounded-full border border-rd-line2 px-4 py-2 text-[13px] font-semibold text-rd-body hover:bg-rd-pink hover:text-rd-dark">
              Bula
            </a>
          </div>
        </div>

        {/* Coluna de preço */}
        <aside className="h-fit overflow-hidden rounded-2xl border-2 border-rd-action lg:sticky lg:top-40">
          {/* Faixa da oferta: desconto e contador em alto contraste */}
          <div className="bg-rd-action px-4 py-2.5 text-white">
            <p className="flex items-center gap-1.5 text-[13px] font-extrabold">
              <Flame size={15} className="shrink-0" />
              OFERTA DE HOJE · {DISCOUNT_LABEL} OFF
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 text-[12px] opacity-95">
              <Timer size={13} className="shrink-0" />
              Termina em{" "}
              <b className="tabular-nums tracking-wide">
                {formatCountdown(remaining)}
              </b>
            </p>
          </div>

          <div className="p-4">
          <div className="flex items-center gap-2">
            <p className="text-[13px] text-rd-mute line-through">
              {brl(selected.to)}
            </p>
            <span className="rounded-md bg-rd-pink px-1.5 py-0.5 text-[11px] font-extrabold text-rd-dark">
              -{DISCOUNT_LABEL}
            </span>
          </div>
          <p className="flex items-end gap-1 text-[32px] leading-none font-extrabold text-rd-ink">
            {brl(unitPrice)}
          </p>
          <p className="mt-1.5 inline-flex rounded-md bg-emerald-50 px-2 py-1 text-[12px] font-bold text-rd-green">
            Economize {brl(selected.to - unitPrice)} nesta dosagem
          </p>
          <p className="mt-1.5 text-[12px] text-rd-mute">
            ou até {MAX_INSTALLMENTS}x de {brl(installment)} sem juros
          </p>
          <p className="mt-2.5 flex items-center gap-1.5 text-[12px] font-semibold text-rd-action">
            <Flame size={13} className="shrink-0" />
            {soldOut
              ? `Dosagem ${dosage} esgotada${regionSuffix}`
              : promoStock === 1
                ? `Última unidade de ${dosage} disponível${regionSuffix}`
                : `${promoStock} unidades de ${dosage} disponíveis${regionSuffix}`}
          </p>
          {customerLocation && (
            <p className="mt-1 flex items-center gap-1 text-[11.5px] text-rd-mute">
              <MapPin size={11} className="shrink-0" />
              Estoque do lote com {DISCOUNT_LABEL} OFF para o CEP{" "}
              {customerLocation.cep}
            </p>
          )}
          <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-rd-line">
            <span
              className="block h-full rounded-full bg-rd-action transition-[width] duration-500"
              style={{
                width: `${Math.min(100, (promoStock / promoLot) * 100)}%`,
              }} />
          </span>
          <p className="mt-1 text-[12px] text-rd-body">
            Dosagem <b className="text-rd-ink">{dosage}</b> · {qty}{" "}
            {qty > 1 ? "unidades" : "unidade"}
          </p>
          <p className="mt-2 flex items-baseline justify-between border-t border-rd-line pt-2 text-[13px] text-rd-body">
            Total do pedido
            <b className="text-[18px] text-rd-ink">{brl(total)}</b>
          </p>
          <p className="text-[12px] font-semibold text-rd-green">
            Você economiza {brl(selected.to * qty - total)} no total
          </p>

          <button
            onClick={() => addToCart(true)}
            disabled={soldOut}
            className="rd-press mt-4 w-full rounded-full bg-rd-action py-3.5 text-[16px] font-extrabold text-white shadow-lg shadow-rd-action/25 hover:bg-rd-dark disabled:cursor-not-allowed disabled:bg-rd-mute disabled:shadow-none">
            {soldOut ? "Dosagem esgotada" : "Comprar agora"}
          </button>
          <button
            onClick={() => addToCart(false)}
            disabled={soldOut || cartFull}
            className="rd-press mt-2 w-full rounded-full border border-rd-action py-3 text-[15px] font-bold text-rd-action hover:bg-rd-pink disabled:cursor-not-allowed disabled:border-rd-line2 disabled:text-rd-mute disabled:hover:bg-transparent">
            {cartFull && !soldOut
              ? "Limite do lote já no carrinho"
              : "Adicionar ao carrinho"}
          </button>

          {/* Selos de confiança logo abaixo do CTA */}
          <ul className="mt-3 grid grid-cols-2 gap-x-2 gap-y-1.5">
            {[
              { icon: <Lock size={13} />, label: "Site seguro" },
              { icon: <BadgeCheck size={13} />, label: "Produto original" },
              { icon: <Truck size={13} />, label: "Frete grátis" },
              { icon: <RefreshCcw size={13} />, label: "Troca garantida" },
            ].map((s) => (
              <li
                key={s.label}
                className="flex items-center gap-1.5 text-[11.5px] font-semibold text-rd-body">
                <span className="text-rd-green">{s.icon}</span>
                {s.label}
              </li>
            ))}
          </ul>

          <div className="mt-5 border-t border-rd-line pt-4">
            <div className="flex items-start gap-3 rounded-xl bg-rd-bg p-3">
              <Truck size={20} className="mt-0.5 shrink-0 text-rd-green" />
              <div>
                <p className="text-[14px] font-bold text-rd-green">
                  Frete grátis para todo o Brasil
                </p>
                <p className="text-[12px] text-rd-mute">
                  Enviamos para todos os estados, sem custo adicional de entrega.
                </p>
              </div>
            </div>
          </div>

          <p className="mt-4 flex items-start gap-2 text-[12px] text-rd-mute">
            <ShieldCheck size={15} className="mt-px shrink-0 text-rd-green" />
            Compra segura. Produto sujeito à retenção de receita no ato da entrega.
          </p>
          </div>
        </aside>
      </div>

      {/* Barra fixa de compra no mobile: preço sempre visível + CTA */}
      <div className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-t border-rd-line bg-white px-4 py-2.5 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] lg:hidden">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[11px] font-bold text-rd-action">
            <Timer size={12} className="shrink-0" />
            <span className="tabular-nums">{formatCountdown(remaining)}</span>
            <span className="text-rd-mute">· {DISCOUNT_LABEL} OFF</span>
          </p>
          <p className="flex items-baseline gap-1.5">
            <b className="text-[18px] leading-none font-extrabold text-rd-ink">
              {brl(total)}
            </b>
            <span className="text-[11px] text-rd-mute line-through">
              {brl(selected.to * qty)}
            </span>
          </p>
        </div>
        <button
          onClick={() => addToCart(true)}
          disabled={soldOut}
          className="rd-press shrink-0 rounded-full bg-rd-action px-6 py-2.5 text-[14px] font-extrabold text-white disabled:cursor-not-allowed disabled:bg-rd-mute">
          {soldOut ? "Esgotado" : "Comprar"}
        </button>
      </div>
    </>
  );
}
