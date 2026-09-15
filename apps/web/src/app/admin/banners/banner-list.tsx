"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { GripVertical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { deleteBannerAction, reorderBannersAction, toggleBannerActiveAction } from "@/server/actions/banner-actions";
import { BannerFormDialog } from "./banner-form-dialog";

type Banner = {
  id: string;
  title: string;
  highlight: string | null;
  subtitle: string | null;
  link: string | null;
  imageUrl: string;
  active: boolean;
  showTitle: boolean;
};

/** Native HTML5 drag-and-drop reordering — no extra dependency. Order is optimistic locally,
 * then persisted via reorderBannersAction; a failed request just gets corrected on next reload. */
export function BannerList({ banners: initialBanners }: { banners: Banner[] }) {
  const [banners, setBanners] = useState(initialBanners);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDrop(targetId: string) {
    if (!draggedId || draggedId === targetId) return;
    const next = [...banners];
    const fromIndex = next.findIndex((b) => b.id === draggedId);
    const toIndex = next.findIndex((b) => b.id === targetId);
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setBanners(next);
    setDraggedId(null);
    startTransition(() => {
      reorderBannersAction(next.map((b) => b.id));
    });
  }

  if (banners.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Nenhum banner cadastrado.</p>;
  }

  return (
    <ul className={isPending ? "opacity-60" : ""}>
      {banners.map((banner) => (
        <li
          key={banner.id}
          draggable
          onDragStart={() => setDraggedId(banner.id)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => handleDrop(banner.id)}
          className="flex items-center gap-3 border-b py-3 last:border-0"
        >
          <GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground" aria-hidden />
          <div className="relative h-12 w-20 shrink-0 overflow-hidden rounded border bg-muted">
            <Image src={banner.imageUrl} alt={banner.title} fill sizes="80px" className="object-cover" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-foreground">{banner.title}</p>
            {banner.subtitle && <p className="truncate text-xs text-muted-foreground">{banner.subtitle}</p>}
          </div>
          <Badge variant={banner.active ? "default" : "secondary"}>{banner.active ? "Ativo" : "Inativo"}</Badge>
          <div className="flex shrink-0 items-center gap-1">
            <BannerFormDialog mode="edit" banner={banner} />
            <form action={toggleBannerActiveAction.bind(null, banner.id, !banner.active)}>
              <Button type="submit" variant="ghost" size="sm">
                {banner.active ? "Desativar" : "Ativar"}
              </Button>
            </form>
            <form action={deleteBannerAction.bind(null, banner.id)}>
              <ConfirmSubmitButton
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                confirmMessage={`Excluir o banner "${banner.title}"?`}
              >
                Excluir
              </ConfirmSubmitButton>
            </form>
          </div>
        </li>
      ))}
    </ul>
  );
}
