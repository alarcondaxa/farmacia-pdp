/**
 * RÉPLICA — PDP Drogasil (T.G. Tirzepatida). Fundo #F2F2F2, conteúdo em cards brancos
 * de raio 16/24px, largura máxima 1366px (idêntica ao container original).
 * Ver ideas.md — nenhuma reinterpretação estética.
 */
import Header from "@/components/Header";
import ProductBlock from "@/components/ProductBlock";
import ProductAbout from "@/components/ProductAbout";
import ProductCarousel from "@/components/ProductCarousel";
import LeafletSection from "@/components/LeafletSection";
import Footer from "@/components/Footer";
import { alsoBought, similarProducts } from "@/data/catalog";
import { trpc } from "@/lib/trpc";

export default function Home() {
  const homepageStatus = trpc.store.homepageStatus.useQuery(undefined, {
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });

  // A pausa intencionalmente não mostra aviso, cabeçalho ou conteúdo.
  if (homepageStatus.data?.paused) {
    return <div className="min-h-screen w-full bg-white" aria-hidden="true" />;
  }

  return (
    <div className="min-h-screen bg-rd-bg">
      <Header />

      <main className="mx-auto w-full max-w-[1366px] px-4 pb-10 lg:px-6">
        <ProductBlock />

        <div className="mt-6 flex flex-col gap-6">
          <ProductAbout />
          <ProductCarousel
            title="Quem comprou, também se interessou"
            items={alsoBought} />
          <ProductCarousel
            title="Similares que você pode se interessar"
            items={similarProducts} />
          <LeafletSection />
        </div>
      </main>

      <Footer />
    </div>
  );
}
