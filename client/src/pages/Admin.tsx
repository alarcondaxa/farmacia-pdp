/**
 * Painel administrativo da loja.
 *
 * Duas áreas: lista completa dos pedidos com todos os dados digitados pelo
 * cliente, e configuração da chave Pix usada para gerar o BR Code do checkout.
 * Acesso restrito: exige login Manus e papel `admin`.
 */
import { Fragment, useEffect, useMemo, useState } from "react";
import {
  BellRing,
  CheckCheck,
  Copy,
  KeyRound,
  LineChart,
  Loader2,
  LogOut,
  MessageCircle,
  Network,
  Package,
  PackageCheck,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import Logo from "@/components/Logo";
import { brl } from "@/lib/pricing";
import { trpc } from "@/lib/trpc";

type StatusValue =
  | "pending"
  | "awaiting_confirmation"
  | "card_declined"
  | "paid"
  | "shipped"
  | "canceled";

const STATUS_LABEL: Record<StatusValue, string> = {
  pending: "Aguardando pagamento",
  awaiting_confirmation: "Cliente informou pagamento",
  card_declined: "Cartão recusado",
  paid: "Pago",
  shipped: "Enviado",
  canceled: "Cancelado",
};

const STATUS_STYLE: Record<StatusValue, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  awaiting_confirmation: "bg-violet-50 text-violet-700 border-violet-300",
  card_declined: "bg-orange-50 text-orange-700 border-orange-300",
  paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
  shipped: "bg-sky-50 text-sky-700 border-sky-200",
  canceled: "bg-rose-50 text-rose-700 border-rose-200",
};

const KEY_TYPES = [
  { value: "aleatoria", label: "Chave aleatória" },
  { value: "cpf", label: "CPF" },
  { value: "cnpj", label: "CNPJ" },
  { value: "email", label: "E-mail" },
  { value: "telefone", label: "Telefone" },
] as const;

function LoginGate({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-rd-bg px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center">
        <Logo className="mx-auto h-7 w-auto" />
        <h1 className="mt-6 text-[20px] font-bold text-rd-ink">
          Painel da loja
        </h1>
        <p className="mt-2 text-[14px] text-rd-body">
          Entre com sua conta para consultar os pedidos e configurar o Pix.
        </p>
        <button
          onClick={onLogin}
          className="rd-press mt-6 w-full rounded-full bg-rd-action py-3 text-[15px] font-bold text-white hover:bg-rd-dark">
          Entrar
        </button>
      </div>
    </div>
  );
}

function pageLabel(pageUrl: string) {
  const path = pageUrl.startsWith("http")
    ? (() => {
        try {
          return new URL(pageUrl).pathname;
        } catch {
          return pageUrl;
        }
      })()
    : pageUrl;

  const labels: Record<string, string> = {
    "/": "Página do produto",
    "/carrinho": "Carrinho",
    "/checkout": "Checkout",
    "/pedido-confirmado": "Pedido confirmado",
    "/admin": "Painel administrativo",
    "/404": "Página não encontrada",
  };

  return labels[path] ?? path;
}

type AdminArea = "overview" | "orders" | "stock" | "payments" | "marketing" | "analytics";

const ADMIN_AREAS: { id: AdminArea; label: string; description: string }[] = [
  { id: "overview", label: "Visão geral", description: "O que precisa da sua atenção" },
  { id: "orders", label: "Pedidos", description: "Vendas, pagamentos e cobranças" },
  { id: "stock", label: "Estoque", description: "Disponibilidade por dosagem" },
  { id: "payments", label: "Pix e regras", description: "Recebimento e proteção da loja" },
  { id: "marketing", label: "Marketing", description: "Meta, Google e conversões" },
  { id: "analytics", label: "Análises", description: "Cliques e comportamento do cliente" },
];

function OverviewCard({ onNavigate }: { onNavigate: (area: AdminArea) => void }) {
  const ordersQuery = trpc.store.admin.orders.useQuery();
  const clickStatsQuery = trpc.store.admin.clickStats.useQuery();
  const orders = ordersQuery.data ?? [];
  const awaiting = orders.filter((order) => order.status === "awaiting_confirmation");
  const pending = orders.filter((order) => order.status === "pending" || order.status === "card_declined");
  const revenue = orders
    .filter((order) => order.status === "paid" || order.status === "shipped")
    .reduce((total, order) => total + order.total, 0);

  const metrics = [
    { label: "Pedidos recebidos", value: String(orders.length), description: "Todos os pedidos" },
    { label: "Aguardando pagamento", value: String(pending.length), description: "Cobrar via WhatsApp" },
    { label: "Avisos para conferir", value: String(awaiting.length), description: "Cliente informou pagamento" },
    { label: "Receita confirmada", value: brl(revenue), description: "Pagos e enviados" },
  ];

  return (
    <section className="rounded-2xl bg-white p-5 lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-rd-action">Central de operações</p>
          <h2 className="mt-1 text-[20px] font-bold text-rd-ink">Resumo da sua loja</h2>
          <p className="mt-1 text-[13px] text-rd-body">Comece pelos pagamentos pendentes e pelos avisos de clientes.</p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate("orders")}
          className="rd-press rounded-full bg-rd-action px-4 py-2 text-[13px] font-bold text-white hover:bg-rd-dark">
          Abrir pedidos
        </button>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-xl border border-rd-line bg-rd-bg p-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-rd-mute">{metric.label}</p>
            <p className="mt-1 text-[20px] font-bold text-rd-ink">{metric.value}</p>
            <p className="mt-1 text-[11.5px] text-rd-body">{metric.description}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        <div className={`rounded-xl border p-4 ${awaiting.length > 0 ? "border-violet-200 bg-violet-50" : "border-rd-line bg-rd-bg"}`}>
          <div className="flex items-center gap-2 text-rd-ink">
            <BellRing size={16} className={awaiting.length > 0 ? "text-violet-700" : "text-rd-mute"} />
            <h3 className="text-[14px] font-bold">Conferência de pagamento</h3>
          </div>
          <p className="mt-1 text-[13px] text-rd-body">
            {awaiting.length > 0
              ? `${awaiting.length} ${awaiting.length === 1 ? "cliente informou pagamento" : "clientes informaram pagamento"}. Confira no banco antes de confirmar.`
              : "Nenhum pagamento informado aguardando sua conferência."}
          </p>
          <button type="button" onClick={() => onNavigate("orders")} className="mt-3 text-[13px] font-bold text-rd-action hover:underline">
            Ver pedidos e pagamentos
          </button>
        </div>
        <div className="rounded-xl border border-rd-line bg-rd-bg p-4">
          <div className="flex items-center gap-2 text-rd-ink">
            <LineChart size={16} className="text-rd-action" />
            <h3 className="text-[14px] font-bold">Atividade no site</h3>
          </div>
          <p className="mt-1 text-[13px] text-rd-body">
            {clickStatsQuery.data?.totalClicks ?? 0} clique{(clickStatsQuery.data?.totalClicks ?? 0) === 1 ? "" : "s"} registrados em {clickStatsQuery.data?.pages.length ?? 0} página{(clickStatsQuery.data?.pages.length ?? 0) === 1 ? "" : "s"}.
          </p>
          <button type="button" onClick={() => onNavigate("analytics")} className="mt-3 text-[13px] font-bold text-rd-action hover:underline">
            Abrir análises de cliques
          </button>
        </div>
      </div>
    </section>
  );
}

function ClickStatsCard() {
  const utils = trpc.useUtils();
  const statsQuery = trpc.store.admin.clickStats.useQuery(undefined, {
    refetchInterval: 15000,
  });
  const [selectedPage, setSelectedPage] = useState("__all__");
  const clearHistory = trpc.store.admin.clearClickHistory.useMutation({
    onSuccess: async ({ deleted }) => {
      setSelectedPage("__all__");
      await utils.store.admin.clickStats.invalidate();
      toast.success(
        deleted === 1
          ? "1 clique foi removido do histórico."
          : `${deleted} cliques foram removidos do histórico.`,
      );
    },
    onError: () => {
      toast.error("Não foi possível limpar o histórico de cliques.");
    },
  });

  const handleClearHistory = () => {
    const total = statsQuery.data?.totalClicks ?? 0;
    if (total === 0) {
      toast.message("Não há cliques para limpar.");
      return;
    }

    const confirmed = window.confirm(
      `Apagar definitivamente todos os ${total} cliques registrados? Esta ação não pode ser desfeita.`,
    );
    if (confirmed) clearHistory.mutate({ confirmed: true });
  };

  if (statsQuery.isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 size={24} className="animate-spin text-rd-action" />
      </div>
    );
  }

  const stats = statsQuery.data;
  const pages = stats?.pages ?? [];
  const elements = (stats?.elements ?? []).filter(
    (row) => selectedPage === "__all__" || row.pageUrl === selectedPage,
  );

  return (
    <section className="rounded-2xl bg-white p-5 lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <LineChart size={18} className="text-rd-action" />
            <h2 className="text-[16px] font-bold text-rd-ink">Cliques dos Clientes</h2>
          </div>
          <p className="mt-1 text-[13px] text-rd-body">
            Acompanhe todos os cliques do site, organizados por página e ação.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleClearHistory}
            disabled={clearHistory.isPending || (stats?.totalClicks ?? 0) === 0}
            className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-3 py-2 text-[12px] font-bold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50">
            {clearHistory.isPending ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
            Limpar cliques
          </button>
          <div className="rounded-xl bg-rd-pink px-4 py-2 text-right">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-rd-body">
              Cliques registrados
            </span>
            <strong className="text-[22px] leading-none text-rd-dark">
              {stats?.totalClicks ?? 0}
            </strong>
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-rd-line bg-rd-bg p-3">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-rd-mute">
            Páginas acessadas
          </span>
          <strong className="mt-1 block text-[20px] text-rd-ink">{pages.length}</strong>
        </div>
        <div className="rounded-xl border border-rd-line bg-rd-bg p-3 sm:col-span-2">
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-rd-mute">
            Ver detalhes da página
          </label>
          <select
            value={selectedPage}
            onChange={(event) => setSelectedPage(event.target.value)}
            className="mt-1 w-full bg-transparent text-[14px] font-semibold text-rd-ink outline-none">
            <option value="__all__">Todas as páginas</option>
            {pages.map((page) => (
              <option key={page.pageUrl} value={page.pageUrl}>
                {pageLabel(page.pageUrl)} — {page.total} clique{page.total === 1 ? "" : "s"}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-5 overflow-x-auto">
        <h3 className="mb-2 text-[13px] font-bold text-rd-ink">Resumo por página</h3>
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-rd-line text-rd-mute">
              <th className="pb-2 font-semibold">Página</th>
              <th className="pb-2 font-semibold">Cliques</th>
              <th className="pb-2 font-semibold">Ações diferentes</th>
              <th className="pb-2 text-right font-semibold">Último clique</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rd-line">
            {pages.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-4 text-center text-rd-mute">
                  Nenhum clique registrado ainda.
                </td>
              </tr>
            ) : (
              pages.map((page) => (
                <tr key={page.pageUrl}>
                  <td className="py-3 font-medium text-rd-ink">{pageLabel(page.pageUrl)}</td>
                  <td className="py-3 font-bold text-rd-dark">{page.total}</td>
                  <td className="py-3 text-rd-body">{page.uniqueElements}</td>
                  <td className="py-3 text-right text-rd-mute">
                    {new Date(page.lastClick).toLocaleString("pt-BR")}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-6 overflow-x-auto">
        <h3 className="mb-2 text-[13px] font-bold text-rd-ink">
          Elementos mais clicados{selectedPage === "__all__" ? "" : ` em ${pageLabel(selectedPage)}`}
        </h3>
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-rd-line text-rd-mute">
              <th className="pb-2 font-semibold">Elemento</th>
              <th className="pb-2 font-semibold">Página</th>
              <th className="pb-2 font-semibold">Cliques</th>
              <th className="pb-2 text-right font-semibold">Último clique</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rd-line">
            {elements.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-4 text-center text-rd-mute">
                  Nenhum clique encontrado para este filtro.
                </td>
              </tr>
            ) : (
              elements.slice(0, 50).map((row) => (
                <tr key={`${row.pageUrl}-${row.elementId}`}>
                  <td className="py-3 font-medium text-rd-ink">
                    {row.elementText || row.elementId}
                  </td>
                  <td className="py-3 text-rd-body">{pageLabel(row.pageUrl)}</td>
                  <td className="py-3">
                    <span className="rounded-full bg-rd-pink px-2 py-0.5 font-bold text-rd-dark">
                      {row.total}
                    </span>
                  </td>
                  <td className="py-3 text-right text-rd-mute">
                    {new Date(row.lastClick).toLocaleString("pt-BR")}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PixSettingsCard({ area }: { area: "payments" | "marketing" }) {
  const utils = trpc.useUtils();
  const settingsQuery = trpc.store.admin.settings.useQuery();
  const [hasMetaCapiToken, setHasMetaCapiToken] = useState(false);
  const save = trpc.store.admin.saveSettings.useMutation({
    onSuccess: (_result, values) => {
      setHasMetaCapiToken((currentlySaved) =>
        values.clearMetaCapiToken
          ? false
          : currentlySaved || Boolean(values.metaCapiToken.trim()),
      );
      toast.success("Configurações salvas");
      utils.store.admin.settings.invalidate();
      utils.store.pixStatus.invalidate();
    },
    onError: (error) =>
      toast.error("Não foi possível salvar", { description: error.message }),
  });

  const [form, setForm] = useState({
    pixKey: "",
    pixKeyType: "aleatoria" as (typeof KEY_TYPES)[number]["value"],
    pixReceiverName: "",
    pixCity: "",
    storeWhatsapp: "",
    maxOrdersPerIp: 2,
    ipWindowHours: 24,
    homepagePaused: false,
    trackingEnabled: true,
    metaPixelId: "",
    metaPixelCode: "",
    // Campo vazio preserva o token que já esteja salvo no servidor.
    metaCapiToken: "",
    clearMetaCapiToken: false,
    metaTestEventCode: "",
    ga4MeasurementId: "",
    googleAdsId: "",
    googleAdsPurchaseLabel: "",
    gtmId: "",
  });

  useEffect(() => {
    if (!settingsQuery.data) return;
    setForm({
      pixKey: settingsQuery.data.pixKey,
      pixKeyType: settingsQuery.data
        .pixKeyType as (typeof KEY_TYPES)[number]["value"],
      pixReceiverName: settingsQuery.data.pixReceiverName,
      pixCity: settingsQuery.data.pixCity,
      storeWhatsapp: settingsQuery.data.storeWhatsapp,
      maxOrdersPerIp: settingsQuery.data.maxOrdersPerIp,
      ipWindowHours: settingsQuery.data.ipWindowHours,
      homepagePaused: settingsQuery.data.homepagePaused,
      trackingEnabled: settingsQuery.data.trackingEnabled,
      metaPixelId: settingsQuery.data.metaPixelId,
      metaPixelCode: settingsQuery.data.metaPixelCode,
      // O token nunca é devolvido ao navegador.
      metaCapiToken: "",
      clearMetaCapiToken: false,
      metaTestEventCode: settingsQuery.data.metaTestEventCode,
      ga4MeasurementId: settingsQuery.data.ga4MeasurementId,
      googleAdsId: settingsQuery.data.googleAdsId,
      googleAdsPurchaseLabel: settingsQuery.data.googleAdsPurchaseLabel,
      gtmId: settingsQuery.data.gtmId,
    });
    setHasMetaCapiToken(settingsQuery.data.hasMetaCapiToken);
  }, [settingsQuery.data]);

  const submit = () => {
    if (!form.pixKey.trim()) {
      toast.error("Informe a chave Pix");
      return;
    }
    if (!form.pixReceiverName.trim()) {
      toast.error("Informe o nome do recebedor");
      return;
    }
    save.mutate(form);
  };

  return (
    <section className="rounded-2xl bg-white p-5 lg:p-6">
      <div className="flex items-center gap-2">
        {area === "payments" ? <KeyRound size={18} className="text-rd-action" /> : <LineChart size={18} className="text-rd-action" />}
        <h2 className="text-[16px] font-bold text-rd-ink">
          {area === "payments" ? "Pix e regras da loja" : "Marketing e conversões"}
        </h2>
      </div>
      <p className="mt-1 text-[13px] text-rd-body">
        {area === "payments"
          ? "Defina como o checkout recebe pagamentos e proteja a loja contra pedidos repetidos."
          : "Concentre os pixels e as conversões em um único local, sem precisar editar código."}
      </p>

      {area === "payments" && (
        <>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-[13px] font-semibold text-rd-body">
            Chave Pix
          </span>
          <input
            value={form.pixKey}
            onChange={(e) => setForm((f) => ({ ...f, pixKey: e.target.value }))}
            placeholder="e-mail, CPF/CNPJ, telefone ou chave aleatória"
            className="w-full rounded-xl border border-rd-line2 px-3 py-2.5 text-[14px] text-rd-ink outline-none focus:border-rd-action" />
        </label>

        <label className="block">
          <span className="mb-1 block text-[13px] font-semibold text-rd-body">
            Tipo de chave
          </span>
          <select
            value={form.pixKeyType}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                pixKeyType: e.target
                  .value as (typeof KEY_TYPES)[number]["value"],
              }))
            }
            className="w-full rounded-xl border border-rd-line2 bg-white px-3 py-2.5 text-[14px] text-rd-ink outline-none focus:border-rd-action">
            {KEY_TYPES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-[13px] font-semibold text-rd-body">
            Nome do recebedor
          </span>
          <input
            value={form.pixReceiverName}
            onChange={(e) =>
              setForm((f) => ({ ...f, pixReceiverName: e.target.value }))
            }
            placeholder="Como aparece na conta"
            className="w-full rounded-xl border border-rd-line2 px-3 py-2.5 text-[14px] text-rd-ink outline-none focus:border-rd-action" />
        </label>

        <label className="block">
          <span className="mb-1 block text-[13px] font-semibold text-rd-body">
            Cidade do recebedor
          </span>
          <input
            value={form.pixCity}
            onChange={(e) => setForm((f) => ({ ...f, pixCity: e.target.value }))}
            placeholder="São Paulo"
            className="w-full rounded-xl border border-rd-line2 px-3 py-2.5 text-[14px] text-rd-ink outline-none focus:border-rd-action" />
        </label>

        <label className="block">
          <span className="mb-1 block text-[13px] font-semibold text-rd-body">
            WhatsApp de atendimento (opcional)
          </span>
          <input
            value={form.storeWhatsapp}
            onChange={(e) =>
              setForm((f) => ({ ...f, storeWhatsapp: e.target.value }))
            }
            placeholder="(11) 90000-0000"
            className="w-full rounded-xl border border-rd-line2 px-3 py-2.5 text-[14px] text-rd-ink outline-none focus:border-rd-action" />
        </label>
      </div>

      {/* Limite por IP: evita que o mesmo visitante abra pedidos em série */}
      <div className="mt-5 rounded-2xl bg-rd-bg p-4">
        <div className="flex items-center gap-2">
          <Network size={16} className="text-rd-action" />
          <h3 className="text-[14px] font-bold text-rd-ink">
            Limite de pedidos por IP
          </h3>
        </div>
        <p className="mt-1 text-[12.5px] text-rd-body">
          Cada pedido registra o IP de origem. Ao atingir o limite, novos
          pedidos do mesmo IP são recusados no checkout.
        </p>

        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[13px] font-semibold text-rd-body">
              Pedidos por IP
            </span>
            <input
              type="number"
              min={0}
              max={50}
              value={form.maxOrdersPerIp}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  maxOrdersPerIp: Math.max(0, Number(e.target.value) || 0),
                }))
              }
              className="w-full rounded-xl border border-rd-line2 bg-white px-3 py-2.5 text-[14px] text-rd-ink outline-none focus:border-rd-action" />
            <span className="mt-1 block text-[11.5px] text-rd-mute">
              Use 0 para desativar o limite.
            </span>
          </label>

          <label className="block">
            <span className="mb-1 block text-[13px] font-semibold text-rd-body">
              Janela em horas
            </span>
            <input
              type="number"
              min={0}
              max={8760}
              value={form.ipWindowHours}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  ipWindowHours: Math.max(0, Number(e.target.value) || 0),
                }))
              }
              className="w-full rounded-xl border border-rd-line2 bg-white px-3 py-2.5 text-[14px] text-rd-ink outline-none focus:border-rd-action" />
            <span className="mt-1 block text-[11.5px] text-rd-mute">
              0 aplica o limite sem prazo (vale para sempre).
            </span>
          </label>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-[14px] font-bold text-rd-ink">
              Página inicial em pausa
            </h3>
            <p className="mt-1 max-w-xl text-[12.5px] text-rd-body">
              Quando ativada, a página inicial fica totalmente branca. O painel,
              os pedidos e as demais rotas continuam disponíveis normalmente.
            </p>
          </div>
          <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-white px-3 py-2 text-[12.5px] font-semibold text-rd-ink shadow-sm">
            <input
              type="checkbox"
              checked={form.homepagePaused}
              onChange={(e) =>
                setForm((f) => ({ ...f, homepagePaused: e.target.checked }))
              }
              className="h-4 w-4 accent-[#EB3C4D]" />
            {form.homepagePaused ? "Pausa ativa" : "Ativar pausa"}
          </label>
        </div>
        {form.homepagePaused && (
          <p className="mt-3 rounded-lg bg-white px-3 py-2 text-[12px] font-medium text-amber-800">
            A vitrine ficará em branco logo após salvar esta configuração.
          </p>
        )}
      </div>
        </>
      )}

      {area === "marketing" && (
        <>
      <div className="mt-4 rounded-2xl border border-rd-line2 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <LineChart size={16} className="text-rd-action" />
            <h3 className="text-[14px] font-bold text-rd-ink">
              Pixels e conversões (Meta e Google)
            </h3>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-[12.5px] font-semibold text-rd-body">
            <input
              type="checkbox"
              checked={form.trackingEnabled}
              onChange={(e) =>
                setForm((f) => ({ ...f, trackingEnabled: e.target.checked }))
              }
              className="h-4 w-4 accent-[#EB3C4D]" />
            Rastreamento ativo
          </label>
        </div>
        <p className="mt-1 text-[12.5px] text-rd-body">
          Com os IDs preenchidos, o site marca automaticamente visualização do
          produto, adição ao carrinho, início de checkout e compra. Desmarcar
          "Rastreamento ativo" desliga os disparos sem apagar os IDs.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-[13px] font-semibold text-rd-body">
              Código-base do Meta Pixel (opcional)
            </span>
            <textarea
              value={form.metaPixelCode}
              onChange={(e) =>
                setForm((f) => ({ ...f, metaPixelCode: e.target.value }))
              }
              rows={4}
              placeholder={'Cole aqui o código completo do Meta Pixel, por exemplo: fbq(\'init\', \'1234567890123456\')'}
              className="w-full resize-y rounded-xl border border-rd-line2 px-3 py-2.5 font-mono text-[12px] text-rd-ink outline-none focus:border-rd-action" />
            <span className="mt-1 block text-[11.5px] text-rd-mute">
              O sistema identifica o Pixel ID automaticamente e instala a tag padrão com segurança. Não é necessário editar o código do site.
            </span>
          </label>

          <label className="block">
            <span className="mb-1 block text-[13px] font-semibold text-rd-body">
              Meta Pixel ID (alternativa ao código completo)
            </span>
            <input
              value={form.metaPixelId}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  metaPixelId: e.target.value.replace(/\D/g, "").slice(0, 16),
                }))
              }
              inputMode="numeric"
              placeholder="1234567890123456"
              className="w-full rounded-xl border border-rd-line2 px-3 py-2.5 text-[14px] tabular-nums text-rd-ink outline-none focus:border-rd-action" />
            <span className="mt-1 block text-[11.5px] text-rd-mute">
              Gerenciador de Eventos → Fontes de dados → seu pixel.
            </span>
          </label>

          <label className="block">
            <span className="mb-1 block text-[13px] font-semibold text-rd-body">
              GA4 (ID de métrica)
            </span>
            <input
              value={form.ga4MeasurementId}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  ga4MeasurementId: e.target.value.toUpperCase().slice(0, 15),
                }))
              }
              placeholder="G-XXXXXXXXXX"
              className="w-full rounded-xl border border-rd-line2 px-3 py-2.5 text-[14px] text-rd-ink outline-none focus:border-rd-action" />
            <span className="mt-1 block text-[11.5px] text-rd-mute">
              Google Analytics → Admin → Fluxos de dados.
            </span>
          </label>

          <label className="block">
            <span className="mb-1 block text-[13px] font-semibold text-rd-body">
              Google Ads (ID de conversão)
            </span>
            <input
              value={form.googleAdsId}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  googleAdsId: e.target.value.toUpperCase().slice(0, 16),
                }))
              }
              placeholder="AW-123456789"
              className="w-full rounded-xl border border-rd-line2 px-3 py-2.5 text-[14px] text-rd-ink outline-none focus:border-rd-action" />
          </label>

          <label className="block">
            <span className="mb-1 block text-[13px] font-semibold text-rd-body">
              Rótulo da conversão de compra
            </span>
            <input
              value={form.googleAdsPurchaseLabel}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  googleAdsPurchaseLabel: e.target.value.slice(0, 60),
                }))
              }
              placeholder="AbC-D_efGhIjKlMn"
              className="w-full rounded-xl border border-rd-line2 px-3 py-2.5 text-[14px] text-rd-ink outline-none focus:border-rd-action" />
            <span className="mt-1 block text-[11.5px] text-rd-mute">
              Google Ads → Conversões → sua ação de compra (parte após a "/").
            </span>
          </label>

          <label className="block">
            <span className="mb-1 block text-[13px] font-semibold text-rd-body">
              Google Tag Manager (opcional)
            </span>
            <input
              value={form.gtmId}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  gtmId: e.target.value.toUpperCase().slice(0, 14),
                }))
              }
              placeholder="GTM-XXXXXXX"
              className="w-full rounded-xl border border-rd-line2 px-3 py-2.5 text-[14px] text-rd-ink outline-none focus:border-rd-action" />
          </label>

          <label className="block">
            <span className="mb-1 flex items-center gap-2 text-[13px] font-semibold text-rd-body">
              Token da Conversions API do Meta
              {hasMetaCapiToken && (
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700">
                  Token salvo
                </span>
              )}
            </span>
            <input
              value={form.metaCapiToken}
              onChange={(e) =>
                setForm((f) => ({ ...f, metaCapiToken: e.target.value }))
              }
              type="password"
              autoComplete="new-password"
              placeholder={hasMetaCapiToken ? "Cole outro token apenas para substituir" : "EAAG..."}
              className="w-full rounded-xl border border-rd-line2 px-3 py-2.5 text-[14px] text-rd-ink outline-none focus:border-rd-action" />
            <span className="mt-1 block text-[11.5px] text-rd-mute">
              Ao marcar o pedido como pago, a compra é enviada pelo servidor ao Meta. Um token já salvo nunca aparece no painel.
            </span>
            {hasMetaCapiToken && (
              <span className="mt-2 flex items-center gap-2 text-[11.5px] text-rd-mute">
                <input
                  type="checkbox"
                  checked={form.clearMetaCapiToken}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, clearMetaCapiToken: e.target.checked }))
                  }
                  className="h-3.5 w-3.5 accent-[#EB3C4D]" />
                Remover o token salvo
              </span>
            )}
          </label>

          <label className="block">
            <span className="mb-1 block text-[13px] font-semibold text-rd-body">
              Código de teste do Events Manager (opcional)
            </span>
            <input
              value={form.metaTestEventCode}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  metaTestEventCode: e.target.value.trim().slice(0, 40),
                }))
              }
              placeholder="TEST12345"
              className="w-full rounded-xl border border-rd-line2 px-3 py-2.5 text-[14px] text-rd-ink outline-none focus:border-rd-action" />
            <span className="mt-1 block text-[11.5px] text-rd-mute">
              Preencha só enquanto valida no "Testar eventos" do Meta. Deixe
              vazio em produção, senão as conversões não contam nas campanhas.
            </span>
          </label>
        </div>
      </div>
        </>
      )}

      <button
        onClick={submit}
        disabled={save.isPending || settingsQuery.isLoading}
        className="rd-press mt-5 inline-flex items-center gap-2 rounded-full bg-rd-action px-6 py-2.5 text-[14px] font-bold text-white hover:bg-rd-dark disabled:opacity-70">
        {save.isPending && <Loader2 size={15} className="animate-spin" />}
        {area === "payments" ? "Salvar Pix e regras" : "Salvar rastreamento"}
      </button>

      <p className="mt-3 text-[12px] text-rd-mute">
        {area === "payments"
          ? "A baixa do pagamento não é automática: confirme o recebimento no seu banco e marque o pedido como pago."
          : "As configurações são aplicadas no site após salvar. O token da Conversions API permanece protegido no servidor."}
      </p>
    </section>
  );
}

function OrdersTable() {
  return <OrdersTableInner />;
}

/**
 * Estoque promocional por dosagem. O número aqui é a fonte da verdade: o
 * checkout recusa pedidos acima do disponível e dá baixa a cada venda.
 */
function StockCard() {
  const utils = trpc.useUtils();
  const stockQuery = trpc.store.admin.stock.useQuery();
  const save = trpc.store.admin.saveStock.useMutation({
    onSuccess: () => {
      toast.success("Estoque atualizado");
      utils.store.admin.stock.invalidate();
      utils.store.availability.invalidate();
    },
    onError: (error) =>
      toast.error("Não foi possível salvar o estoque", {
        description: error.message,
      }),
  });

  const [rows, setRows] = useState<
    { dosage: string; available: number; lot: number }[]
  >([]);

  useEffect(() => {
    if (stockQuery.data) setRows(stockQuery.data);
  }, [stockQuery.data]);

  const update = (dosage: string, field: "available" | "lot", value: number) =>
    setRows((prev) =>
      prev.map((row) =>
        row.dosage === dosage
          ? { ...row, [field]: Math.max(field === "lot" ? 1 : 0, value) }
          : row,
      ),
    );

  const totalAvailable = rows.reduce((sum, row) => sum + row.available, 0);

  return (
    <section className="rounded-2xl bg-white p-5 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <PackageCheck size={18} className="text-rd-action" />
            <h2 className="text-[16px] font-bold text-rd-ink">
              Estoque por dosagem
            </h2>
          </div>
          <p className="mt-1 text-[13px] text-rd-body">
            O checkout dá baixa a cada pedido e recusa compras acima do
            disponível. Cancelar ou apagar um pedido devolve as unidades.
          </p>
        </div>
        <span className="rounded-full bg-rd-bg px-3 py-1.5 text-[12.5px] font-bold text-rd-ink">
          {totalAvailable} unidades no total
        </span>
      </div>

      {stockQuery.isLoading ? (
        <p className="mt-4 flex items-center gap-2 text-[13px] text-rd-mute">
          <Loader2 size={14} className="animate-spin" /> Carregando estoque...
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => (
            <div
              key={row.dosage}
              className={`rounded-xl border p-3 ${
                row.available === 0
                  ? "border-rose-200 bg-rose-50"
                  : "border-rd-line2 bg-white"
              }`}>
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-bold text-rd-ink">
                  {row.dosage}
                </span>
                {row.available === 0 && (
                  <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                    Esgotado
                  </span>
                )}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-[11.5px] font-semibold text-rd-mute">
                    Disponível
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={row.available}
                    onChange={(e) =>
                      update(row.dosage, "available", Number(e.target.value) || 0)
                    }
                    className="w-full rounded-lg border border-rd-line2 bg-white px-2.5 py-2 text-[14px] font-bold text-rd-ink outline-none focus:border-rd-action" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11.5px] font-semibold text-rd-mute">
                    Lote
                  </span>
                  <input
                    type="number"
                    min={1}
                    value={row.lot}
                    onChange={(e) =>
                      update(row.dosage, "lot", Number(e.target.value) || 1)
                    }
                    className="w-full rounded-lg border border-rd-line2 bg-white px-2.5 py-2 text-[14px] text-rd-body outline-none focus:border-rd-action" />
                </label>
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => save.mutate({ items: rows })}
        disabled={save.isPending || rows.length === 0}
        className="rd-press mt-5 inline-flex items-center gap-2 rounded-full bg-rd-action px-6 py-2.5 text-[14px] font-bold text-white hover:bg-rd-dark disabled:opacity-70">
        {save.isPending && <Loader2 size={15} className="animate-spin" />}
        Salvar estoque
      </button>

      <p className="mt-3 text-[12px] text-rd-mute">
        O campo "Lote" define apenas o tamanho da barra de progresso exibida na
        página do produto.
      </p>
    </section>
  );
}

function OrdersTableInner() {
  const utils = trpc.useUtils();
  const ordersQuery = trpc.store.admin.orders.useQuery();
  const updateStatus = trpc.store.admin.updateStatus.useMutation({
    onSuccess: (result, variables) => {
      // Ao confirmar como pago, o servidor tenta enviar a compra ao Meta pela
      // Conversions API. Mostramos o resultado para o admin saber se a
      // conversão chegou ou se falta configurar o token.
      if (variables.status === "paid" && result.capi) {
        if (result.capi.sent) {
          toast.success("Pedido pago · conversão enviada ao Meta");
        } else {
          toast.warning("Pedido marcado como pago", {
            description: `Conversão não enviada ao Meta: ${result.capi.reason}`,
          });
        }
      } else {
        toast.success("Status atualizado");
      }
      utils.store.admin.orders.invalidate();
    },
  });

  // Abre o WhatsApp do cliente com a cobrança Pix já escrita.
  const whatsappCharge = trpc.store.admin.whatsappCharge.useMutation({
    onSuccess: (result) => {
      window.open(result.url, "_blank", "noopener,noreferrer");
      toast.success("Cobrança aberta no WhatsApp", {
        description: "Revise a mensagem e envie ao cliente.",
      });
      utils.store.admin.orders.invalidate();
    },
    onError: (error) =>
      toast.error("Não foi possível montar a cobrança", {
        description: error.message,
      }),
  });
  const removeOrder = trpc.store.admin.deleteOrder.useMutation({
    onSuccess: () => {
      toast.success("Pedido removido");
      utils.store.admin.orders.invalidate();
    },
  });

  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);

  const orders = ordersQuery.data ?? [];

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return orders;
    return orders.filter((order) =>
      [
        order.reference,
        order.customerName,
        order.email,
        order.cpf,
        order.phone,
        order.city,
      ]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [orders, search]);

  const revenue = useMemo(
    () =>
      orders
        .filter((o) => o.status === "paid" || o.status === "shipped")
        .reduce((sum, o) => sum + o.total, 0),
    [orders],
  );

  // Pedidos em que o cliente clicou em "Já paguei" e aguardam sua conferência.
  const claimed = useMemo(
    () => orders.filter((o) => o.status === "awaiting_confirmation"),
    [orders],
  );

  return (
    <section className="rounded-2xl bg-white p-5 lg:p-6">
      {claimed.length > 0 && (
        <div className="mb-5 rounded-2xl border border-violet-300 bg-violet-50 p-4">
          <p className="flex items-center gap-2 text-[14px] font-bold text-violet-800">
            <BellRing size={16} />
            {claimed.length}{" "}
            {claimed.length === 1
              ? "cliente informou pagamento"
              : "clientes informaram pagamento"}
          </p>
          <p className="mt-1 text-[12.5px] text-violet-700">
            Confira o recebimento no seu banco antes de confirmar. O aviso é
            declarado pelo cliente e não comprova o pagamento.
          </p>
          <ul className="mt-3 space-y-2">
            {claimed.map((order) => (
              <li
                key={order.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-3 py-2">
                <span className="text-[13px] text-rd-body">
                  <b className="text-rd-ink">{order.reference}</b> ·{" "}
                  {order.customerName} · {brl(order.total)}
                  {order.paymentClaimedAt && (
                    <span className="text-rd-mute">
                      {" "}
                      · avisou em{" "}
                      {new Date(order.paymentClaimedAt).toLocaleString("pt-BR")}
                    </span>
                  )}
                </span>
                <button
                  onClick={() =>
                    updateStatus.mutate({ id: order.id, status: "paid" })
                  }
                  disabled={updateStatus.isPending}
                  className="rd-press inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-1.5 text-[12.5px] font-bold text-white hover:bg-emerald-700 disabled:opacity-60">
                  <CheckCheck size={14} /> Confirmar como pago
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Package size={18} className="text-rd-action" />
          <h2 className="text-[16px] font-bold text-rd-ink">
            Pedidos recebidos
          </h2>
          <span className="rounded-full bg-rd-bg px-2 py-0.5 text-[12px] font-semibold text-rd-body">
            {orders.length}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-rd-mute" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, CPF, e-mail..."
              className="w-[240px] rounded-full border border-rd-line2 py-2 pl-9 pr-3 text-[13px] outline-none focus:border-rd-action" />
          </div>
          <button
            onClick={() => ordersQuery.refetch()}
            className="rd-press rounded-full border border-rd-line2 p-2 text-rd-body hover:border-rd-action hover:text-rd-action"
            aria-label="Atualizar lista">
            <RefreshCw
              size={15}
              className={ordersQuery.isFetching ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {(
          [
            ["Total de pedidos", String(orders.length)],
            [
              "Aguardando pgto.",
              String(orders.filter((o) => o.status === "pending").length),
            ],
            ["Avisos de pgto.", String(claimed.length)],
            [
              "Pagos",
              String(orders.filter((o) => o.status === "paid").length),
            ],
            ["Receita confirmada", brl(revenue)],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="rounded-xl bg-rd-bg p-3">
            <p className="text-[11px] uppercase tracking-wide text-rd-mute">
              {label}
            </p>
            <p className="mt-1 text-[16px] font-bold text-rd-ink">{value}</p>
          </div>
        ))}
      </div>

      {ordersQuery.isLoading ? (
        <p className="mt-6 flex items-center gap-2 text-[14px] text-rd-mute">
          <Loader2 size={15} className="animate-spin" /> Carregando pedidos...
        </p>
      ) : filtered.length === 0 ? (
        <p className="mt-6 rounded-xl bg-rd-bg p-4 text-[14px] text-rd-body">
          Nenhum pedido {search ? "encontrado para esta busca" : "recebido ainda"}.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-rd-line text-[12px] uppercase tracking-wide text-rd-mute">
                <th className="py-2 pr-3 font-semibold">Pedido</th>
                <th className="py-2 pr-3 font-semibold">Cliente</th>
                <th className="py-2 pr-3 font-semibold">Contato</th>
                <th className="py-2 pr-3 font-semibold">Entrega</th>
                <th className="py-2 pr-3 font-semibold">Pagamento</th>
                <th className="py-2 pr-3 font-semibold">Total</th>
                <th className="py-2 pr-3 font-semibold">Status</th>
                <th className="py-2 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((order) => (
                <Fragment key={order.id}>
                  <tr className="border-b border-rd-line align-top">
                    <td className="py-3 pr-3">
                      <button
                        onClick={() =>
                          setExpanded(expanded === order.id ? null : order.id)
                        }
                        className="font-bold text-rd-action hover:underline">
                        {order.reference}
                      </button>
                      <p className="text-[11px] text-rd-mute">
                        {new Date(order.createdAt).toLocaleString("pt-BR")}
                      </p>
                    </td>
                    <td className="py-3 pr-3">
                      <p className="font-semibold text-rd-ink">
                        {order.customerName}
                      </p>
                      <p className="text-[12px] text-rd-mute">
                        CPF {order.cpf}
                      </p>
                    </td>
                    <td className="py-3 pr-3">
                      <p className="text-rd-body">{order.email}</p>
                      <p className="text-[12px] text-rd-mute">{order.phone}</p>
                    </td>
                    <td className="py-3 pr-3 text-rd-body">
                      <p>
                        {order.address}, {order.number}
                        {order.complement ? ` — ${order.complement}` : ""}
                      </p>
                      <p className="text-[12px] text-rd-mute">
                        {order.district} · {order.city}/{order.state} ·{" "}
                        {order.cep}
                      </p>
                    </td>
                    <td className="py-3 pr-3 text-rd-body">
                      {order.paymentMethod === "pix"
                        ? "Pix"
                        : `Cartão ${order.installments}x`}
                      {order.paymentMethod === "card" && order.cardLast4 && (
                        <p className="text-[12px] text-rd-mute">
                          {order.cardBrand} ****{order.cardLast4}
                        </p>
                      )}
                    </td>
                    <td className="py-3 pr-3 font-bold text-rd-ink">
                      {brl(order.total)}
                    </td>
                    <td className="py-3 pr-3">
                      <select
                        value={order.status}
                        onChange={(e) =>
                          updateStatus.mutate({
                            id: order.id,
                            status: e.target.value as StatusValue,
                          })
                        }
                        className={`rounded-full border px-2.5 py-1 text-[12px] font-semibold outline-none ${
                          STATUS_STYLE[order.status as StatusValue]
                        }`}>
                        {(Object.keys(STATUS_LABEL) as StatusValue[]).map(
                          (value) => (
                            <option key={value} value={value}>
                              {STATUS_LABEL[value]}
                            </option>
                          ),
                        )}
                      </select>
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        {/* A única ação de cobrança é manual: abre a conversa
                            do cliente com o Pix pronto, sem disparo automático. */}
                        {(["pending", "awaiting_confirmation", "card_declined"] as StatusValue[]).includes(
                          order.status as StatusValue,
                        ) && (
                          <button
                            onClick={() => whatsappCharge.mutate({ id: order.id })}
                            disabled={whatsappCharge.isPending}
                            title={
                              order.chargeSentAt
                                ? `Última cobrança aberta em ${new Date(order.chargeSentAt).toLocaleString("pt-BR")}`
                                : "Abrir cobrança Pix no WhatsApp"
                            }
                            className="rd-press inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-emerald-700 disabled:opacity-60">
                            {whatsappCharge.isPending ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <MessageCircle size={14} />
                            )}
                            Cobrar via WhatsApp
                          </button>
                        )}
                      <button
                        onClick={() => {
                          if (
                            window.confirm(
                              `Remover o pedido ${order.reference}? Esta ação não pode ser desfeita.`,
                            )
                          ) {
                            removeOrder.mutate({ id: order.id });
                          }
                        }}
                        className="rd-press rounded-lg p-1.5 text-rd-mute hover:bg-rd-pink hover:text-rd-action"
                        aria-label="Remover pedido">
                        <Trash2 size={15} />
                      </button>
                      </div>
                    </td>
                  </tr>

                  {expanded === order.id && (
                    <tr className="bg-rd-bg">
                      <td colSpan={8} className="p-4">
                        <p className="text-[13px] font-bold text-rd-ink">
                          Itens do pedido
                        </p>
                        <ul className="mt-1 space-y-1 text-[13px] text-rd-body">
                          {order.items.map((item) => (
                            <li key={item.sku}>
                              {item.quantity}x {item.name} —{" "}
                              {brl(item.unitPrice)} cada
                            </li>
                          ))}
                        </ul>

                        {order.pixPayload && (
                          <div className="mt-3">
                            <p className="text-[13px] font-bold text-rd-ink">
                              Código Pix gerado
                            </p>
                            <div className="mt-1 flex items-start gap-2">
                              <code className="block flex-1 break-all rounded-lg bg-white p-2 font-mono text-[11px] text-rd-body">
                                {order.pixPayload}
                              </code>
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(
                                    order.pixPayload ?? "",
                                  );
                                  toast.success("Código copiado");
                                }}
                                className="rd-press rounded-lg border border-rd-line2 p-2 text-rd-body hover:border-rd-action hover:text-rd-action"
                                aria-label="Copiar código Pix">
                                <Copy size={14} />
                              </button>
                            </div>
                          </div>
                        )}

                        {order.chargeSentAt && (
                          <p className="mt-3 text-[12px] text-rd-mute">
                            Última cobrança aberta no WhatsApp em{" "}
                            {new Date(order.chargeSentAt).toLocaleString("pt-BR")}
                          </p>
                        )}
                        {order.capiSentAt && (
                          <p className="mt-2 text-[12px] text-emerald-700">
                            Conversão enviada ao Meta em{" "}
                            {new Date(order.capiSentAt).toLocaleString("pt-BR")}
                          </p>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function Admin() {
  const { user } = useAuth();
  const [activeArea, setActiveArea] = useState<AdminArea>("overview");
  const currentArea = ADMIN_AREAS.find((area) => area.id === activeArea) ?? ADMIN_AREAS[0];

  return (
    <div className="min-h-screen bg-rd-bg">
      <header className="border-b border-rd-line bg-white">
        <div className="mx-auto flex w-full max-w-[1366px] flex-wrap items-center justify-between gap-3 px-4 py-4 lg:px-6">
          <div className="flex items-center gap-3">
            <Logo className="h-6 w-auto" />
            <span className="rounded-full bg-rd-pink px-2.5 py-1 text-[12px] font-bold text-rd-dark">
              Painel da loja
            </span>
          </div>
          <span className="text-[13px] text-rd-body">Administrador</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1366px] px-4 py-5 lg:px-6 lg:py-6">
        <div className="rounded-2xl border border-rd-line bg-white p-3 shadow-sm">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {ADMIN_AREAS.map((area) => {
              const isActive = activeArea === area.id;
              return (
                <button
                  key={area.id}
                  type="button"
                  onClick={() => setActiveArea(area.id)}
                  className={`rd-press shrink-0 rounded-xl px-3.5 py-2 text-left transition ${
                    isActive
                      ? "bg-rd-action text-white shadow-sm"
                      : "text-rd-body hover:bg-rd-bg hover:text-rd-ink"
                  }`}
                  aria-current={isActive ? "page" : undefined}>
                  <span className="block text-[13px] font-bold">{area.label}</span>
                  <span className={`mt-0.5 block text-[10.5px] ${isActive ? "text-white/80" : "text-rd-mute"}`}>{area.description}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-rd-action">Painel administrativo</p>
            <h1 className="mt-1 text-[22px] font-bold text-rd-ink">{currentArea.label}</h1>
          </div>
          <p className="hidden text-right text-[12px] text-rd-body sm:block">{currentArea.description}</p>
        </div>

        <div className="mt-5">
          {activeArea === "overview" && <OverviewCard onNavigate={setActiveArea} />}
          {activeArea === "orders" && <OrdersTable />}
          {activeArea === "stock" && <StockCard />}
          {activeArea === "payments" && <PixSettingsCard area="payments" />}
          {activeArea === "marketing" && <PixSettingsCard area="marketing" />}
          {activeArea === "analytics" && <ClickStatsCard />}
        </div>
      </main>
    </div>
  );
}
