/**
 * Modal exibido na primeira visita: o cliente informa o CEP para vermos a
 * disponibilidade do lote promocional na região dele. Sem CEP, a navegação fica
 * bloqueada (overlay), como fazem farmácias que dependem de estoque regional.
 */
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Loader2, MapPin, PackageCheck, Truck } from "lucide-react";
import {
  maskCep,
  useCustomerLocation,
} from "@/contexts/LocationContext";
import { trpc } from "@/lib/trpc";

export default function CepGate() {
  const { needsCep, setLocation } = useCustomerLocation();
  const [path] = useLocation();
  const homepageStatus = trpc.store.homepageStatus.useQuery(undefined, {
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });
  const [cep, setCep] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const digits = cep.replace(/\D/g, "");
  const ready = digits.length === 8;

  const cepQuery = trpc.store.lookupCep.useQuery(
    { cep: digits },
    {
      enabled: ready && submitted,
      retry: false,
      // Resultado bom pode ser cacheado, mas o erro precisa reaparecer sempre
      // que o cliente reenviar o mesmo CEP inválido.
      staleTime: 60 * 60 * 1000,
      gcTime: 60 * 60 * 1000,
    },
  );

  const utils = trpc.useUtils();

  useEffect(() => {
    if (!cepQuery.data || !submitted) return;
    const found = cepQuery.data;
    setLocation({
      cep: maskCep(digits),
      city: found.city,
      state: found.state,
      district: found.district,
      address: found.address,
    });
  }, [cepQuery.data, submitted, digits, setLocation]);

  // O modal existe para qualificar o visitante da vitrine. No painel e nas
  // telas de pedido já em andamento ele só atrapalharia (o admin não precisa
  // informar CEP para gerenciar pedidos).
  const exemptRoutes = ["/admin", "/pedido-confirmado"];
  const exempt = exemptRoutes.some(route => path.startsWith(route));

  // A pausa é limitada à vitrine: checkout, confirmação e painel continuam operando.
  const homepagePaused = path === "/" && homepageStatus.data?.paused;
  if (!needsCep || exempt || homepagePaused) return null;

  const error = submitted && cepQuery.error ? cepQuery.error.message : "";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-rd-ink/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-[420px] rounded-3xl bg-white p-6 shadow-2xl">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-rd-pink">
          <MapPin size={22} className="text-rd-action" />
        </span>

        <h2 className="mt-4 text-[19px] font-extrabold leading-tight text-rd-ink">
          Informe seu CEP para continuar
        </h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-rd-body">
          O lote com desconto é distribuído por região. Com o CEP mostramos
          quantas unidades estão reservadas perto de você e confirmamos a entrega
          refrigerada.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!ready) return;
            // Reenviar o mesmo CEP precisa consultar de novo: sem isso o erro
            // em cache não reaparece e o botão parece não responder.
            utils.store.lookupCep.invalidate({ cep: digits });
            setSubmitted(true);
          }}
          className="mt-5">
          <label
            htmlFor="cepGate"
            className="mb-1.5 block text-[12.5px] font-semibold text-rd-body">
            CEP de entrega
          </label>
          <div className="flex items-center gap-2">
            <input
              id="cepGate"
              value={cep}
              onChange={(e) => {
                setCep(maskCep(e.target.value));
                setSubmitted(false);
              }}
              inputMode="numeric"
              autoFocus
              placeholder="00000-000"
              className="min-w-0 flex-1 rounded-full border border-rd-line2 px-4 py-3 text-[15px] tabular-nums text-rd-ink outline-none focus:border-rd-action" />
            <button
              type="submit"
              disabled={!ready || cepQuery.isFetching}
              className="rd-press flex shrink-0 items-center gap-2 rounded-full bg-rd-action px-5 py-3 text-[14px] font-bold text-white hover:bg-rd-dark disabled:opacity-60">
              {cepQuery.isFetching && (
                <Loader2 size={15} className="animate-spin" />
              )}
              Continuar
            </button>
          </div>

          {error && (
            <p className="mt-2 text-[12.5px] font-semibold text-rose-600">
              {error}
            </p>
          )}
        </form>

        <ul className="mt-5 space-y-2 border-t border-rd-line pt-4">
          <li className="flex items-center gap-2 text-[12.5px] text-rd-body">
            <PackageCheck size={15} className="shrink-0 text-rd-green" />
            Unidades do lote promocional reservadas para sua região
          </li>
          <li className="flex items-center gap-2 text-[12.5px] text-rd-body">
            <Truck size={15} className="shrink-0 text-rd-green" />
            Frete grátis para todo o Brasil, com transporte refrigerado
          </li>
        </ul>
      </div>
    </div>
  );
}
