/**
 * RÉPLICA — bloco "Bula" ao final da PDP, com aviso de automedicação
 * e link para o PDF oficial referenciado no HTML original.
 */
import { FileText } from "lucide-react";
import { product } from "@/data/product";

export default function LeafletSection() {
  return (
    <section id="bula" className="rounded-2xl bg-white p-4 lg:p-6">
      <h2 className="mb-2 text-[18px] font-bold text-rd-ink lg:text-[20px]">
        Bula
      </h2>
      <p className="text-[14px] text-rd-body">
        <b className="text-rd-ink">{product.brand}</b> — Princípio Ativo:{" "}
        <b className="text-rd-ink">{product.activeIngredient}</b>
      </p>
      <p className="mt-3 max-w-3xl text-[14px] leading-relaxed text-rd-mute">
        Tenha cuidado, leia a bula, a automedicação pode colocar a sua saúde em
        risco. Só use medicamentos com orientação médica e/ou farmacêutica.
      </p>
      <a
        href={product.leafletUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="rd-press mt-4 inline-flex items-center gap-2 rounded-full border border-rd-action px-4 py-2 text-[14px] font-bold text-rd-action hover:bg-rd-pink">
        <FileText size={16} /> Ler bula do {product.brand}
      </a>
    </section>
  );
}
