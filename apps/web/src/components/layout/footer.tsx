import Image from "next/image";
import Link from "next/link";
import { listTopLevelActiveCategories } from "@/server/actions/category-actions";

export async function Footer() {
  const year = new Date().getFullYear();
  const categories = await listTopLevelActiveCategories();

  return (
    <footer className="bg-foreground text-background">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-4 lg:px-8">
        <div>
          <Image src="/logo-seuzuca-branca.png" alt="Seu Zuca" width={362} height={146} className="h-14 w-auto" />
          <p className="mt-3 text-sm text-background/70">
            Marketplace B2B de materiais de construção. Conectamos fornecedores e construtoras em
            todo o Brasil, exclusivo para pessoas jurídicas.
          </p>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-background">Institucional</h3>
          <ul className="mt-3 space-y-2 text-sm text-background/70">
            <li>
              <Link href="/quem-somos" className="hover:text-warning">
                Quem somos
              </Link>
            </li>
            <li>
              <Link href="/como-funciona" className="hover:text-warning">
                Como funciona
              </Link>
            </li>
            <li>
              <Link href="/seja-fornecedor" className="hover:text-warning">
                Seja um fornecedor
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-background">Categorias</h3>
          <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-background/70">
            {categories.slice(0, 6).map((category) => (
              <li key={category.slug}>
                <Link href={`/catalogo?categoria=${category.slug}`} className="hover:text-warning">
                  {category.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-background">Minha conta</h3>
          <ul className="mt-3 space-y-2 text-sm text-background/70">
            <li>
              <Link href="/login" className="hover:text-warning">
                Entrar
              </Link>
            </li>
            <li>
              <Link href="/cadastro" className="hover:text-warning">
                Criar conta B2B
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-background/15">
        <div className="mx-auto max-w-7xl px-4 py-4 text-center text-xs text-background/60 sm:px-6 lg:px-8">
          © {year} Seu Zuca. Todos os direitos reservados. Plataforma exclusiva para pessoas
          jurídicas (CNPJ ativo).
        </div>
      </div>
    </footer>
  );
}
