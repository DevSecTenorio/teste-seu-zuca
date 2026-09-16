"use client";

import { useState } from "react";
import Image from "next/image";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// Reaparece a cada visita à home (sem persistência em storage) — decisão intencional
// para reforçar o aviso, já que o ambiente é usado em demonstrações e testes de QA.
export function TestSiteNotice() {
  const [open, setOpen] = useState(true);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        showCloseButton={false}
        className="overflow-hidden p-0 sm:max-w-md"
      >
        <div
          className="h-2.5 w-full"
          style={{
            /* Azul-marinho e laranja da própria logo do Seu Zuca. */
            backgroundImage:
              "repeating-linear-gradient(45deg, #21294c 0, #21294c 14px, #ef5131 14px, #ef5131 28px)",
          }}
          aria-hidden="true"
        />

        <div className="flex flex-col items-center gap-4 px-6 pt-8 pb-2 text-center">
          <Image
            src="/logo-seuzuca.png"
            alt="Seu Zuca"
            width={819}
            height={301}
            className="h-16 w-auto"
          />

          <DialogHeader className="items-center gap-1.5 text-center">
            <DialogTitle className="font-display text-xl uppercase tracking-wide text-foreground">
              Ambiente de testes
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Você está em uma versão de demonstração do marketplace Seu Zuca, usada para testes
              e validação. Nenhum pedido, pagamento ou cadastro aqui é real — os dados podem ser
              apagados ou reiniciados a qualquer momento.
            </DialogDescription>
          </DialogHeader>
        </div>

        <DialogFooter className="px-6 pb-6 sm:justify-center">
          <DialogClose asChild>
            <Button size="lg" className="w-full sm:w-auto">
              Entendi, continuar
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
