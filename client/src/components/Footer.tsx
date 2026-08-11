/**
 * RÉPLICA — footer da Drogasil: dois cards de serviço, seis colunas de links,
 * formas de pagamento (SVGs do CDN oficial) e texto legal Raia Drogasil.
 * Bloco externo cinza #F2F2F2 com raio 24px sobre superfície branca.
 */
import {
  Facebook,
  Headphones,
  Instagram,
  Linkedin,
  Smartphone,
  Twitter,
} from "lucide-react";
import { toast } from "sonner";
import { footerGroups, paymentMethods } from "@/data/catalog";

const demo = () =>
  toast("Promoção válida somente para essa página", {
    description:
      "Ao sair dela você perde o desconto, continue para comprar.",
  });

const socialIcon: Record<string, React.ReactNode> = {
  Facebook: <Facebook size={18} />,
  Instagram: <Instagram size={18} />,
  Twitter: <Twitter size={18} />,
  LinkedIn: <Linkedin size={18} />,
};

export default function Footer() {
  return (
    <footer className="flex w-full justify-center bg-white pb-16 lg:pb-0">
      <div className="w-full max-w-[1366px] px-4 lg:px-6">
        <div className="my-6 rounded-3xl bg-rd-bg">
          {/* Cards de serviço */}
          <div className="flex flex-col gap-4 p-6 lg:flex-row">
            {[
              {
                icon: <Headphones size={26} />,
                title: "Central de atendimento",
                subtitle:
                  "Confira as dúvidas mais frequentes ou fale com a gente.",
              },
              {
                icon: <Smartphone size={26} />,
                title: "Baixe o nosso aplicativo",
                subtitle: "E tenha descontos e benefícios exclusivos!",
              },
            ].map((c) => (
              <button
                key={c.title}
                onClick={demo}
                className="rd-press flex flex-1 items-center justify-between gap-4 rounded-2xl bg-white px-5 py-6 text-left hover:bg-rd-pink">
                <span className="flex items-center gap-4">
                  <span className="text-rd-action">{c.icon}</span>
                  <span>
                    <span className="block text-[15px] font-bold text-rd-ink">
                      {c.title}
                    </span>
                    <span className="block text-[13px] text-rd-mute">
                      {c.subtitle}
                    </span>
                  </span>
                </span>
              </button>
            ))}
          </div>

          {/* Colunas de links */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-8 px-6 pb-6 md:grid-cols-3 lg:grid-cols-6">
            {footerGroups.map((g) => (
              <div key={g.group}>
                <p className="mb-3 text-[14px] font-bold text-rd-ink">
                  {g.group}
                </p>
                <ul className={g.icons ? "flex gap-3" : "space-y-2"}>
                  {g.items.map((it) => (
                    <li key={it.name}>
                      <button
                        onClick={demo}
                        aria-label={it.name}
                        className={
                          g.icons
                            ? "rd-press rounded-full bg-white p-2 text-rd-action hover:bg-rd-pink"
                            : "text-left text-[13px] text-rd-mute hover:text-rd-dark hover:underline"
                        }>
                        {g.icons ? socialIcon[it.name] : it.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Pagamentos */}
          <div className="mx-6 mb-6 flex flex-col items-start gap-4 rounded-2xl bg-white p-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="mb-1 text-[14px] font-bold text-rd-ink">
                Formas de pagamento
              </p>
              <p className="mb-3 text-[12px] text-rd-mute">
                Parcele em até 3x* sem juros nos cartões de crédito
              </p>
              <div className="flex flex-wrap gap-1">
                {paymentMethods.map((p) => (
                  <img
                    key={p.alt}
                    src={p.image}
                    alt={p.alt}
                    loading="lazy"
                    className="h-8 w-12 object-contain" />
                ))}
              </div>
            </div>
            <img
              src="https://img-raiadrogasil.s3.amazonaws.com/home/Footer/AnvisaDesktop.svg"
              alt="Anvisa"
              loading="lazy"
              className="h-6 object-contain" />
          </div>
        </div>

        {/* Texto legal */}
        <div className="pb-8 text-[12px] leading-relaxed text-rd-mute">
          <p>
            Raia Drogasil SA | DROGASIL | 61.585.865/0240-93 | I.E.
            116.756.280.113 | Av. Nsa. Sra. Assunção, 638 | Butantã | São Paulo
            (SP) | CEP 05359-001 | Farmacêutico responsável: Gisele da Penha
            Barbosa | CRF 89453 | AFE: 7.17094.5 | CMVS -
            355030801-477-002443-1-7. As informações contidas neste site não
            devem ser usadas para automedicação e não substituem, em hipótese
            alguma, as orientações dadas pelo profissional da área médica.
            Somente o médico está apto a diagnosticar qualquer problema de saúde
            e prescrever o tratamento adequado. Ao persistirem os sintomas, um
            médico deverá ser consultado. Os preços e promoções divulgados no
            site são válidos apenas para compras feitas pela internet. Maiores
            esclarecimentos, consultar o site: www.anvisa.gov.br. Todos os
            pedidos efetuados estão sujeitos à confirmação da disponibilidade de
            produto em nosso estoque.
          </p>
          <p className="mt-3 text-[11px]">
            Réplica visual criada para fins de demonstração, sem vínculo com a
            Raia Drogasil S.A.
          </p>
        </div>
      </div>
    </footer>
  );
}
