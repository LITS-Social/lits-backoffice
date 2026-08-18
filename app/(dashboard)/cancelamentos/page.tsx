import { redirect } from "next/navigation";

// Unificado no painel #06 Dinheiro — as tabelas continuam neste diretório,
// importadas de lá. O redirect preserva links guardados.
export default function Page() {
  redirect("/dinheiro");
}
