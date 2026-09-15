"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type BannerData = {
  id: string;
  title: string;
  highlight: string | null;
  subtitle: string | null;
  imageUrl: string;
  link: string | null;
  showTitle: boolean;
};

const AUTOPLAY_MS = 6000;

export function BannerCarousel({ banners }: { banners: BannerData[] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (banners.length <= 1) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % banners.length), AUTOPLAY_MS);
    return () => clearInterval(timer);
  }, [banners.length]);

  if (banners.length === 0) return null;

  const banner = banners[index];
  const content = (
    <div className="relative aspect-[16/6] w-full overflow-hidden rounded-xl bg-muted sm:aspect-[21/6]">
      <Image
        src={banner.imageUrl}
        alt={banner.title}
        fill
        priority
        sizes="100vw"
        className="object-cover"
      />
      {banner.showTitle && (
        <>
          <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/20 to-transparent" />
          <div className="absolute inset-0 flex flex-col justify-center gap-2 px-6 sm:px-12">
            {banner.highlight && (
              <span className="w-fit rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                {banner.highlight}
              </span>
            )}
            <h2 className="max-w-xl text-2xl font-semibold text-white sm:text-4xl">{banner.title}</h2>
            {banner.subtitle && <p className="max-w-md text-sm text-white/90 sm:text-base">{banner.subtitle}</p>}
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="relative">
      {banner.link ? <Link href={banner.link}>{content}</Link> : content}

      {banners.length > 1 && (
        <>
          <button
            type="button"
            aria-label="Banner anterior"
            onClick={() => setIndex((i) => (i - 1 + banners.length) % banners.length)}
            className="absolute top-1/2 left-3 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 text-foreground shadow hover:bg-background"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Próximo banner"
            onClick={() => setIndex((i) => (i + 1) % banners.length)}
            className="absolute top-1/2 right-3 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 text-foreground shadow hover:bg-background"
          >
            <ChevronRight className="size-4" />
          </button>
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
            {banners.map((b, i) => (
              <button
                key={b.id}
                type="button"
                aria-label={`Ir para o banner ${i + 1}`}
                onClick={() => setIndex(i)}
                className={cn("h-1.5 rounded-full transition-all", i === index ? "w-6 bg-white" : "w-1.5 bg-white/50")}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
