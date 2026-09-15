"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { createBannerAction, updateBannerAction } from "@/server/actions/banner-actions";
import { INITIAL_FORM_STATE, type FormState } from "@/server/actions/form-state";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Salvando..." : label}
    </Button>
  );
}

export function BannerFormDialog({
  mode,
  banner,
}: {
  mode: "create" | "edit";
  banner?: { id: string; title: string; highlight: string | null; subtitle: string | null; link: string | null; showTitle: boolean };
}) {
  const [open, setOpen] = useState(false);
  const action = mode === "edit" && banner ? updateBannerAction.bind(null, banner.id) : createBannerAction;
  const [state, formAction] = useActionState<FormState, FormData>(action, INITIAL_FORM_STATE);

  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.status === "success") setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {mode === "create" ? (
          <Button>
            <Plus className="size-4" /> Novo banner
          </Button>
        ) : (
          <Button variant="ghost" size="icon-sm" aria-label="Editar banner">
            <Pencil className="size-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Novo banner" : "Editar banner"}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="title">Título</Label>
            <Input id="title" name="title" defaultValue={banner?.title} required />
            {state.fieldErrors?.title && <p className="text-sm text-destructive">{state.fieldErrors.title[0]}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="highlight">Destaque (selo curto, opcional)</Label>
            <Input id="highlight" name="highlight" defaultValue={banner?.highlight ?? ""} placeholder="Ex.: Até 15% off" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="subtitle">Subtítulo (opcional)</Label>
            <Input id="subtitle" name="subtitle" defaultValue={banner?.subtitle ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="link">Link (opcional)</Label>
            <Input id="link" name="link" defaultValue={banner?.link ?? ""} placeholder="/catalogo?categoria=argamassa" />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="showTitle"
              name="showTitle"
              type="checkbox"
              defaultChecked={banner?.showTitle ?? true}
              className="size-4 rounded border-input"
            />
            <Label htmlFor="showTitle" className="font-normal">
              Exibir título/destaque/subtítulo sobre a imagem
            </Label>
          </div>
          <div className="space-y-2">
            <Label htmlFor="image">{mode === "create" ? "Imagem" : "Substituir imagem (opcional)"}</Label>
            <Input id="image" name="image" type="file" accept="image/png,image/jpeg,image/webp" required={mode === "create"} />
            {state.fieldErrors?.image && <p className="text-sm text-destructive">{state.fieldErrors.image[0]}</p>}
          </div>
          {state.status === "error" && state.message && <p className="text-sm text-destructive">{state.message}</p>}
          <DialogFooter>
            <SubmitButton label={mode === "create" ? "Criar banner" : "Salvar alterações"} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
