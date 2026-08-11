/**
 * RÉPLICA — carrossel de recomendação ("Quem comprou, também se interessou").
 * Cards brancos raio 16px, título 14px em #303030, unidade 12px em #6B6B6B,
 * setas circulares com borda #D1D1D1. Rolagem horizontal por scroll-snap.
 */
import { useRef } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import type { CarouselProduct } from "@/data/catalog";

const demo = () =>
  toast("Promoção válida somente para essa página", {
    description:
      "Ao sair dela você perde o desconto, continue para comprar.",
  });

export default function ProductCarousel({
  title,
  items,
}: {
  title: string;
  items: CarouselProduct[];
}) {
  const ref = useRef<HTMLDivElement>(null);

  const scroll = (dir: -1 | 1) => {
    ref.current?.scrollBy({ left: dir * 420, behavior: "smooth" });
  };

  return (
    <section className="rounded-2xl bg-white p-4 lg:p-6">
      <header className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-[16px] font-bold text-rd-ink lg:text-[20px]">
          {title}
        </h2>
        <div className="flex gap-2">
          <button
            onClick={() => scroll(-1)}
            aria-label="Anterior"
            className="rd-press rounded-full border border-rd-line2 p-2 text-rd-body hover:bg-rd-pink hover:text-rd-dark">
            <ArrowLeft size={16} />
          </button>
          <button
            onClick={() => scroll(1)}
            aria-label="Próximo"
            className="rd-press rounded-full border border-rd-line2 p-2 text-rd-body hover:bg-rd-pink hover:text-rd-dark">
            <ArrowRight size={16} />
          </button>
        </div>
      </header>

      <div
        ref={ref}
        className="rd-scroll flex snap-x snap-mandatory gap-4 overflow-x-auto pb-1">
        {items.map((p) => (
          <button
            key={p.name}
            onClick={demo}
            className="group w-[168px] shrink-0 snap-start text-left lg:w-[181px]">
            <div className="mb-2 flex h-[168px] items-center justify-center overflow-hidden rounded-2xl border border-rd-line bg-white p-3 transition-colors group-hover:border-rd-action">
              <img
                src={p.image}
                alt={p.name}
                loading="lazy"
                className="h-full w-full object-contain transition-transform duration-200 group-hover:scale-[1.04]" />
            </div>
            <h3 className="line-clamp-3 text-[13px] leading-snug font-semibold text-rd-ink group-hover:text-rd-dark">
              {p.name}
            </h3>
            <span className="text-[12px] text-rd-mute">{p.qty}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
