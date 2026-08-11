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

export default function Home() {
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
