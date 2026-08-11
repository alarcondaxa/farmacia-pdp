/**
 * RÉPLICA — página de carrinho.
 * Mesmos tokens da PDP: fundo #F2F2F2, cards brancos raio 16px, ações em #B6202F.
 */
import { Link, useLocation } from "wouter";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  Lock,
  Minus,
  Plus,
  ShoppingCart,
  Timer,
  Trash2,
  Truck,
} from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useCart } from "@/contexts/CartContext";
import { product } from "@/data/product";
import {
  DISCOUNT_LABEL,
  MAX_INSTALLMENTS,
  brl,
  discounted,
  endOfToday,
  formatCountdown,
} from "@/lib/pricing";
import { trackEvent } from "@/lib/tracking";

export default function Cart() {
  const {
    items,
    count,
    subtotal,
    listTotal,
    savings,
    setQty,
    removeItem,
    stockFor,
  } = useCart();
  const [, navigate] = useLocation();
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

  return (
    <div className="min-h-screen bg-rd-bg">
      <Header />

      <main className="mx-auto w-full max-w-[1366px] px-4 pb-10 lg:px-6">
        {items.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-rd-action px-4 py-3 text-white">
            <p className="flex items-center gap-2 text-[13.5px] font-extrabold">
              <Timer size={16} className="shrink-0" />
              Desconto de {DISCOUNT_LABEL} reservado por{" "}
              <span className="tabular-nums">{formatCountdown(remaining)}</span>
            </p>
            <p className="text-[12.5px] opacity-95">
              Você economiza {brl(savings)} neste pedido
            </p>
          </div>
        )}

        <div className="flex items-center gap-2 py-4">
          <Link
            href="/"
            className="rd-press flex items-center gap-1.5 text-[13px] font-semibold text-rd-body hover:text-rd-dark">
            <ArrowLeft size={15} /> Continuar comprando
          </Link>
        </div>

        <h1 className="mb-4 text-[22px] font-bold text-rd-ink lg:text-[26px]">
          Meu carrinho{" "}
          <span className="text-[15px] font-normal text-rd-mute">
            ({count} {count === 1 ? "item" : "itens"})
          </span>
        </h1>

        {items.length === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-2xl bg-white p-8">
            <ShoppingCart size={32} className="text-rd-line2" />
            <p className="text-[16px] font-bold text-rd-ink">
              Seu carrinho está vazio
            </p>
            <p className="text-[14px] text-rd-mute">
              Aproveite o desconto de {DISCOUNT_LABEL} válido somente hoje.
            </p>
            <Link
              href="/"
              className="rd-press mt-2 rounded-full bg-rd-action px-6 py-2.5 text-[14px] font-bold text-white hover:bg-rd-dark">
              Ver o produto
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
            <section className="rounded-2xl bg-white p-4 lg:p-6">
              <ul className="divide-y divide-rd-line">
                {items.map((item) => {
                  const list = product.dosagePrices[item.dosage].to;
                  const unit = discounted(list);
                  const limit = stockFor(item.dosage);
                  const atLimit = item.qty >= limit;
                  return (
                    <li
                      key={item.dosage}
                      className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center">
                      <img
                        src={product.dosageImages[item.dosage]}
                        alt={`Embalagem T.G ${item.dosage}`}
                        className="h-24 w-24 shrink-0 rounded-xl border border-rd-line object-contain p-1" />

                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] font-bold text-rd-ink">
                          {product.name}
                        </p>
                        <p className="text-[13px] text-rd-mute">
                          Dosagem {item.dosage} · Vendido por {product.seller}
                        </p>
                        <p className="mt-1 text-[13px] text-rd-mute line-through">
                          {brl(list)}
                        </p>
                        <p className="text-[15px] font-bold text-rd-ink">
                          {brl(unit)}{" "}
                          <span className="text-[12px] font-semibold text-rd-green">
                            {DISCOUNT_LABEL} OFF
                          </span>
                        </p>
                        {limit < 99 && (
                          <p className="mt-1 text-[12px] font-semibold text-rd-action">
                            {limit === 1
                              ? "Última unidade disponível nesta dosagem"
                              : `${limit} unidades disponíveis nesta dosagem`}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1 rounded-full border border-rd-line2 p-1">
                          <button
                            onClick={() => setQty(item.dosage, item.qty - 1)}
                            aria-label="Diminuir"
                            className="rd-press rounded-full p-1.5 text-rd-action hover:bg-rd-pink">
                            <Minus size={15} />
                          </button>
                          <span className="w-8 text-center text-[14px] font-bold text-rd-ink">
                            {item.qty}
                          </span>
                          <button
                            onClick={() => setQty(item.dosage, item.qty + 1)}
                            disabled={atLimit}
                            aria-label="Aumentar"
                            className="rd-press rounded-full p-1.5 text-rd-action hover:bg-rd-pink disabled:cursor-not-allowed disabled:text-rd-line2 disabled:hover:bg-transparent">
                            <Plus size={15} />
                          </button>
                        </div>
                        <button
                          onClick={() => removeItem(item.dosage)}
                          aria-label="Remover item"
                          className="rd-press rounded-full p-2 text-rd-mute hover:bg-rd-pink hover:text-rd-dark">
                          <Trash2 size={16} />
                        </button>
                      </div>

                      <p className="w-28 shrink-0 text-right text-[15px] font-bold text-rd-ink">
                        {brl(Math.round(unit * item.qty * 100) / 100)}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </section>

            <aside className="h-fit rounded-2xl bg-white p-4 lg:sticky lg:top-40 lg:p-6">
              <h2 className="mb-4 text-[16px] font-bold text-rd-ink">
                Resumo do pedido
              </h2>
              <dl className="space-y-2 text-[14px]">
                <div className="flex justify-between text-rd-body">
                  <dt>Subtotal</dt>
                  <dd className="line-through">{brl(listTotal)}</dd>
                </div>
                <div className="flex justify-between text-rd-green">
                  <dt>Desconto de hoje ({DISCOUNT_LABEL})</dt>
                  <dd>-{brl(savings)}</dd>
                </div>
                <div className="flex justify-between text-rd-body">
                  <dt>Frete</dt>
                  <dd className="font-bold text-rd-green">Grátis</dd>
                </div>
                <div className="flex items-baseline justify-between border-t border-rd-line pt-3">
                  <dt className="text-[15px] font-bold text-rd-ink">Total</dt>
                  <dd className="text-[22px] font-extrabold text-rd-ink">
                    {brl(subtotal)}
                  </dd>
                </div>
              </dl>
              <p className="mt-1 text-[12px] text-rd-mute">
                ou até {MAX_INSTALLMENTS}x de{" "}
                {brl(subtotal / MAX_INSTALLMENTS)} sem juros
              </p>

              <button
                onClick={() => {
                  // Conversão: início de checkout com o carrinho completo.
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
                  navigate("/checkout");
                }}
                className="rd-press mt-4 w-full rounded-full bg-rd-action py-3.5 text-[16px] font-extrabold text-white shadow-lg shadow-rd-action/25 hover:bg-rd-dark">
                Finalizar compra
              </button>

              <ul className="mt-3 grid grid-cols-2 gap-x-2 gap-y-1.5">
                {[
                  { icon: <Lock size={13} />, label: "Compra segura" },
                  { icon: <BadgeCheck size={13} />, label: "Produto original" },
                ].map((s) => (
                  <li
                    key={s.label}
                    className="flex items-center gap-1.5 text-[11.5px] font-semibold text-rd-body">
                    <span className="text-rd-green">{s.icon}</span>
                    {s.label}
                  </li>
                ))}
              </ul>

              <div className="mt-4 flex items-start gap-2 rounded-xl bg-rd-bg p-3">
                <Truck size={18} className="mt-0.5 shrink-0 text-rd-green" />
                <p className="text-[12px] text-rd-body">
                  <b className="text-rd-green">Frete grátis</b> para todo o
                  Brasil, sem custo adicional de entrega.
                </p>
              </div>
            </aside>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
