/**
 * Garante que toda navegação entre rotas comece no topo da página.
 * Sem isso, o wouter preserva a posição do scroll e a nova página abre
 * no rodapé quando o usuário clicava em um botão já rolado para baixo.
 */
import { useEffect } from "react";
import { useLocation } from "wouter";

export default function ScrollToTop() {
  const [pathname] = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);

  return null;
}
