/**
 * RÉPLICA — "Descrição do produto" + painel de atributos + "Características".
 * H2 16/20px em #303030, corpo 14px em #575757; tabela com linhas #E6E6E6.
 */
import { Beaker, FileText, Microscope, Pill } from "lucide-react";
import { product } from "@/data/product";

export default function ProductAbout() {
  return (
    <div
      id="descricao"
      className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
      <section className="rounded-2xl bg-white p-4 lg:p-6">
        <h2 className="mb-4 text-[18px] font-bold text-rd-ink lg:text-[20px]">
          Descrição do produto
        </h2>

        {product.description.map((block) => (
          <div key={block.title} className="mb-6">
            <h3 className="mb-2 text-[15px] font-bold text-rd-ink">
              {block.title}
            </h3>
            <ul className="space-y-1.5">
              {block.items.map((it) => (
                <li
                  key={it}
                  className="flex gap-2 text-[14px] leading-relaxed text-rd-body">
                  <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-rd-action" />
                  {it}
                </li>
              ))}
            </ul>
            {block.note && (
              <p className="mt-3 text-[14px] font-bold text-rd-ink">
                {block.note}
              </p>
            )}
          </div>
        ))}

        {product.descriptionNotes.map((n) => (
          <p key={n} className="mb-2 text-[14px] font-bold text-rd-ink">
            {n}
          </p>
        ))}

        {product.legalBoxes.slice(1).map((t) => (
          <p key={t} className="legal-box">
            {t}
          </p>
        ))}
      </section>

      <div className="flex flex-col gap-6">
        <section className="rounded-2xl bg-white p-4 lg:p-6">
          <div className="space-y-3 text-[14px] text-rd-body">
            <p className="flex items-center gap-2">
              <Microscope size={16} className="text-rd-action" /> Marca{" "}
              <b className="text-rd-ink">{product.brand}</b>
            </p>
            <p className="flex items-center gap-2">
              <Pill size={16} className="text-rd-action" /> Quantidade{" "}
              <b className="text-rd-ink">{product.quantity}</b>
            </p>
            <p className="flex items-center gap-2">
              <Beaker size={16} className="text-rd-action" /> Princípio Ativo{" "}
              <b className="text-rd-ink">{product.activeIngredient}</b>
            </p>
            <p className="flex items-center gap-2">
              <FileText size={16} className="text-rd-action" /> Classe{" "}
              <b className="text-rd-ink">{product.therapeuticClass}</b>
            </p>
          </div>
        </section>

        <section className="rounded-2xl bg-white p-4 lg:p-6">
          <h2 className="mb-4 text-[16px] font-bold text-rd-ink">
            Características
          </h2>
          <div className="divide-y divide-rd-line">
            {product.characteristics.map((c) => (
              <div
                key={c.label}
                className="flex items-center justify-between gap-4 py-2.5 text-[14px]">
                <span className="text-rd-mute">{c.label}</span>
                <span className="font-semibold text-rd-ink">{c.value}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
