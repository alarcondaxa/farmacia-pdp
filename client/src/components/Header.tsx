/**
 * RÉPLICA — Header da PDP Drogasil.
 * Tokens: superfície branca, ícones #B6202F, busca com borda #D1D1D1 e pill 999px,
 * hover de itens com fundo #FDE7EA e texto #941925. Ver ideas.md.
 */
import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  MapPin,
  Menu,
  Package,
  Search,
  ShoppingCart,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import Logo from "./Logo";
import { categories } from "@/data/catalog";
import { useCart } from "@/contexts/CartContext";
import { useCustomerLocation } from "@/contexts/LocationContext";
import { useClickTracking } from "@/hooks/useClickTracking";
import { trpc } from "@/lib/trpc";

const demo = () =>
  toast("Promoção válida somente para essa página", {
    description:
      "Ao sair dela você perde o desconto, continue para comprar.",
  });

function ActionButton({
  icon,
  top,
  bottom,
}: {
  icon: React.ReactNode;
  top: string;
  bottom: string;
}) {
  return (
    <button
      onClick={demo}
      className="rd-press flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-left hover:bg-rd-pink">
      <span className="text-rd-action">{icon}</span>
      <span className="hidden flex-col leading-tight lg:flex">
        <span className="text-[12px] font-normal text-rd-mute">{top}</span>
        <span className="text-[14px] font-bold text-rd-ink">{bottom}</span>
      </span>
    </button>
  );
}

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeCat, setActiveCat] = useState(0);
  const [cepOpen, setCepOpen] = useState(false);
  // O CEP vem do contexto (definido no modal de entrada) para header, PDP e
  // checkout mostrarem sempre a mesma região.
  const {
    location: customerLocation,
    label: regionLabel,
    setLocation,
    clearLocation,
  } = useCustomerLocation();
  const [cep, setCep] = useState(customerLocation?.cep ?? "");

  useEffect(() => {
    setCep(customerLocation?.cep ?? "");
  }, [customerLocation?.cep]);

  const cepDigits = cep.replace(/\D/g, "");
  const cepLookup = trpc.store.lookupCep.useQuery(
    { cep: cepDigits },
    { enabled: false, retry: false },
  );

  const confirmCep = async () => {
    if (cepDigits.length !== 8) {
      toast.error("Informe um CEP com 8 dígitos.");
      return;
    }
    try {
      const result = await cepLookup.refetch();
      const found = result.data;
      if (!found) throw new Error("CEP não encontrado");
      setLocation({
        cep,
        city: found.city,
        state: found.state,
        district: found.district,
        address: found.address,
      });
      setCepOpen(false);
      toast.success(`Entrega para ${found.city}/${found.state}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível consultar o CEP",
      );
    }
  };
  const wrapRef = useRef<HTMLDivElement>(null);
  const { count } = useCart();
  const [, navigate] = useLocation();
  const { trackClick } = useClickTracking();

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className="sticky top-0 z-50 bg-white">
      {/* Linha 1 — logo, busca, ações */}
      <header className="mx-auto flex w-full max-w-[1366px] items-center gap-4 px-4 py-3 lg:px-6">
        <a
          href="/"
          onClick={() => trackClick("header-logo", "Logo Drogasil")}
          aria-label="Ir para a página inicial da Drogasil"
          className="shrink-0">
          <Logo className="h-9 w-[112px] lg:h-12 lg:w-[149px]" />
        </a>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            trackClick("header-search", "Busca");
            demo();
          }}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-rd-line2 bg-white px-4 py-2 transition-colors focus-within:border-rd-action">
          <Search size={18} className="shrink-0 text-rd-mute" />
          <input
            id="searchHeader"
            placeholder="Buscar na Drogasil"
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent text-[14px] text-rd-ink outline-none placeholder:text-rd-mute" />
          <button
            type="submit"
            aria-label="buscar"
            className="rd-press hidden rounded-full p-1.5 text-rd-action hover:bg-rd-pink sm:block">
            <Search size={18} />
          </button>
        </form>

        <div className="flex shrink-0 items-center gap-1">
          <ActionButton
            icon={<Package size={22} />}
            top="Acompanhar"
            bottom="pedidos" />
          <button
            onClick={() => {
              navigate("/carrinho");
              trackClick("header-cart", "Carrinho");
            }}
            aria-label="Carrinho"
            className="rd-press relative rounded-full bg-rd-action p-2.5 text-white hover:bg-rd-dark">
            <ShoppingCart size={20} />
            <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rd-ink px-1 text-[11px] font-bold text-white">
              {count}
            </span>
          </button>
        </div>
      </header>

      {/* Linha 2 — CEP + categorias */}
      <div ref={wrapRef} className="border-b border-rd-line bg-white">
        <div className="mx-auto flex w-full max-w-[1366px] items-center gap-2 px-4 pb-2 lg:gap-3 lg:px-6">
          <div className="relative">
            <button
              onClick={() => setCepOpen((v) => !v)}
              aria-expanded={cepOpen}
              className="rd-press flex shrink-0 items-center gap-1.5 rounded-full border border-rd-line2 px-3 py-1.5 text-[13px] font-semibold whitespace-nowrap text-rd-body hover:bg-rd-pink hover:text-rd-dark">
              <MapPin size={16} className="text-rd-action" />
              {regionLabel ? `${regionLabel} · ${customerLocation?.cep}` : "Informe seu CEP"}
              <ChevronDown size={14} />
            </button>
            {cepOpen && (
              <div className="absolute top-full left-0 z-50 mt-2 w-72 rounded-2xl border border-rd-line bg-white p-4 shadow-lg">
                <p className="mb-2 text-[13px] font-bold text-rd-ink">
                  Onde você quer receber sua compra?
                </p>
                <input
                  value={cep}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "").slice(0, 8);
                    setCep(v.length > 5 ? `${v.slice(0, 5)}-${v.slice(5)}` : v);
                  }}
                  placeholder="00000-000"
                  inputMode="numeric"
                  className="w-full rounded-xl border border-rd-line2 px-3 py-2 text-[14px] outline-none focus:border-rd-action" />
                <button
                  onClick={() => {
                    confirmCep();
                    trackClick("header-cep-confirm", "Confirmar CEP");
                  }}
                  disabled={cepLookup.isFetching}
                  className="rd-press mt-3 w-full rounded-full bg-rd-action py-2 text-[14px] font-bold text-white hover:bg-rd-dark disabled:opacity-70">
                  {cepLookup.isFetching ? "Consultando..." : "Confirmar"}
                </button>
                {customerLocation && (
                  <button
                    onClick={() => {
                      clearLocation();
                      setCepOpen(false);
                    }}
                    className="rd-press mt-2 w-full rounded-full border border-rd-line2 py-2 text-[13px] font-semibold text-rd-body hover:bg-rd-pink">
                    Trocar de região
                  </button>
                )}
              </div>
            )}
          </div>

          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="rd-press flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-[14px] font-bold whitespace-nowrap text-rd-ink hover:bg-rd-pink hover:text-rd-dark">
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
            <span className="hidden sm:inline">Todas as categorias</span>
            <span className="sm:hidden">Categorias</span>
          </button>

          <nav className="rd-scroll hidden flex-1 items-center gap-1 overflow-x-auto xl:flex">
            {categories.map((c, i) => (
              <button
                key={c.name}
                onClick={() => {
                  setActiveCat(i);
                  setMenuOpen(true);
                }}
                className="rd-press shrink-0 rounded-full px-3 py-1.5 text-[14px] text-rd-body hover:bg-rd-pink hover:text-rd-dark">
                {c.name}
              </button>
            ))}
          </nav>
        </div>

        {/* Mega-menu */}
        {menuOpen && (
          <div className="border-t border-rd-line bg-white shadow-lg">
            <div className="mx-auto flex w-full max-w-[1366px] px-4 lg:px-6">
              <ul className="w-64 shrink-0 border-r border-rd-line py-3">
                {categories.map((c, i) => (
                  <li key={c.name}>
                    <button
                      onMouseEnter={() => setActiveCat(i)}
                      onClick={() => setActiveCat(i)}
                      className={`flex w-full items-center justify-between rounded-full px-4 py-2.5 text-left text-[14px] transition-colors ${
                        activeCat === i
                          ? "bg-rd-pink font-bold text-rd-dark"
                          : "text-rd-body hover:bg-rd-pink hover:text-rd-dark"
                      }`}>
                      {c.name}
                      <ChevronRight size={15} />
                    </button>
                  </li>
                ))}
              </ul>
              <div className="rd-scroll max-h-[420px] flex-1 overflow-y-auto py-4 pl-6">
                <div className="columns-2 gap-8 lg:columns-3">
                  {categories[activeCat].children.map((sub) => (
                    <div key={sub.name} className="mb-5 break-inside-avoid">
                      <button
                        onClick={demo}
                        className="mb-1.5 block text-left text-[14px] font-bold text-rd-ink hover:text-rd-dark hover:underline">
                        {sub.name}
                      </button>
                      <ul className="space-y-1">
                        {sub.children.map((g) => (
                          <li key={g}>
                            <button
                              onClick={demo}
                              className="block text-left text-[13px] text-rd-mute hover:text-rd-dark hover:underline">
                              {g}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
