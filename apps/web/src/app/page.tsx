import Link from "next/link";
import { Truck, Building2, ShieldCheck, Percent, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductCard } from "@/components/product-card";
import { BannerCarousel } from "@/components/banner-carousel";
import { TestSiteNotice } from "@/components/test-site-notice";
import { getCategoryIcon } from "@/lib/icons";
import { listTopLevelActiveCategories } from "@/server/actions/category-actions";
import { getActiveBanners, getFeaturedProducts } from "@/server/queries/storefront";

const TRUST_BADGES = [
  { icon: Truck, label: "Entrega em todo o Brasil" },
  { icon: Percent, label: "Preços exclusivos PJ" },
  { icon: ShieldCheck, label: "Compra segura" },
  { icon: Building2, label: "Exclusivo pessoa jurídica" },
];

// Three themed highlight blocks (SPEC.md §4). Slugs match the official category seed; a block
// silently skips rendering if its category isn't present (e.g. deactivated), rather than pointing
// at a broken filter.
const HIGHLIGHT_BLOCKS = [
  {
    categorySlug: "argamassa",
    title: "Atacado de cimento e estrutura",
    description: "Condições especiais para pedidos grandes, com pedido mínimo por categoria.",
    className: "from-primary/15 to-primary/5",
  },
  {
    categorySlug: "acabamento",
    title: "Acabamento e pisos",
    description: "Porcelanatos, tintas e revestimentos direto de fornecedores aprovados.",
    className: "from-brand-orange/15 to-brand-orange/5",
  },
  {
    categorySlug: "hidraulica",
    title: "Infraestrutura hidráulica e elétrica",
    description: "Tudo para instalações prediais em um só lugar, com prazos claros.",
    className: "from-foreground/15 to-foreground/5",
  },
];

export default async function Home() {
  const [banners, categories, featuredProducts] = await Promise.all([
    getActiveBanners(),
    listTopLevelActiveCategories(),
    getFeaturedProducts(8),
  ]);

  const categoryBySlug = new Map(categories.map((c) => [c.slug, c]));

  return (
    <div className="flex flex-1 flex-col">
      <TestSiteNotice />

      {banners.length > 0 && (
        <section className="mx-auto w-full max-w-7xl px-4 pt-6 pb-6 sm:px-6 lg:px-8">
          <BannerCarousel banners={banners} />
        </section>
      )}

      <section className="bg-primary">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-6 px-4 py-8 sm:px-6 md:grid-cols-4 lg:px-8">
          {TRUST_BADGES.map(({ icon: Icon, label }) => (
            <div key={label} className="flex flex-col items-center gap-2 text-center sm:flex-row sm:text-left">
              <Icon className="size-6 shrink-0 text-primary-foreground" />
              <span className="text-sm font-medium text-primary-foreground">{label}</span>
            </div>
          ))}
        </div>
      </section>

      {categories.length > 0 && (
        <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <h2 className="font-display text-2xl uppercase tracking-wide text-foreground">Categorias</h2>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
            {categories.map((category, index) => {
              const Icon = getCategoryIcon(category.icon);
              const swatch = index % 2 === 0 ? "bg-primary" : "bg-brand-orange";
              return (
                <Link
                  key={category.id}
                  href={`/catalogo?categoria=${category.slug}`}
                  className="flex flex-col items-center gap-2 rounded-lg border bg-card p-4 text-center transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-md"
                >
                  <span className={`flex size-11 items-center justify-center rounded-full text-primary-foreground ${swatch}`}>
                    <Icon className="size-5" />
                  </span>
                  <span className="text-sm font-medium text-foreground">{category.name}</span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <section className="mx-auto w-full max-w-7xl px-4 pb-4 sm:px-6 lg:px-8">
        <div className="grid gap-4 md:grid-cols-3">
          {HIGHLIGHT_BLOCKS.filter((b) => categoryBySlug.has(b.categorySlug)).map((block) => (
            <Link
              key={block.categorySlug}
              href={`/catalogo?categoria=${block.categorySlug}`}
              className={`group flex flex-col justify-between gap-4 rounded-xl border bg-gradient-to-br p-6 transition-shadow hover:shadow-md ${block.className}`}
            >
              <div>
                <h3 className="text-lg font-semibold text-foreground">{block.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{block.description}</p>
              </div>
              <span className="flex items-center gap-1 text-sm font-medium text-primary">
                Explorar <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {featuredProducts.length > 0 && (
        <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-2xl uppercase tracking-wide text-foreground">Produtos em destaque</h2>
            <Button asChild variant="ghost">
              <Link href="/catalogo">
                Ver todos <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {featuredProducts.map((product) => (
              <ProductCard key={product.slug} product={product} />
            ))}
          </div>
        </section>
      )}

      <section className="bg-gradient-to-br from-foreground to-primary-ink">
        <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-20 text-center sm:px-6 lg:px-8">
          <h2 className="font-display text-3xl uppercase tracking-wide text-background">
            Compre e venda materiais de construção sem intermediários confusos
          </h2>
          <p className="mt-4 text-background/80">
            Crie sua conta B2B em poucos minutos: envie os dados da sua empresa e a documentação
            necessária, e nossa equipe libera o acesso após a análise. Fornecedores aprovados podem
            cadastrar produtos; compradores aprovados compram com condições exclusivas — inclusive
            com um sistema de cotação para pedidos maiores.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/cadastro">Criar conta B2B gratuita</Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-background/60 bg-transparent text-background hover:bg-background hover:text-foreground"
            >
              <Link href="/como-funciona">Como funciona</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
