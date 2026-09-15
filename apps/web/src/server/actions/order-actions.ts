"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireApprovedUser } from "@/lib/auth/require-user";
import { canTransition, ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/order-status";
import { logAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { uploadInvoiceDocument } from "@/lib/storage";
import { validateInvoiceFile } from "@/lib/validation/files";
import type { FormState } from "./form-state";

export async function applyOrderStatusTransition(orderId: string, to: OrderStatus, note: string, actorId: string | null) {
  const [order] = await db
    .update(schema.orders)
    .set({ status: to, updatedAt: new Date() })
    .where(eq(schema.orders.id, orderId))
    .returning({ id: schema.orders.id, buyerId: schema.orders.buyerId });
  await db.insert(schema.orderStatusEvents).values({ orderId, status: to, note, createdBy: actorId });
  await logAudit({ actorId, action: "order.status_change", entityType: "order", entityId: orderId, after: { status: to, note } });
  revalidatePath(`/pedidos/${orderId}`);
  revalidatePath("/pedidos");
  revalidatePath("/fornecedor/painel");

  const buyer = await db.query.users.findFirst({ where: eq(schema.users.id, order.buyerId) });
  if (buyer) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    await sendEmail({
      to: buyer.email,
      subject: `Pedido atualizado: ${ORDER_STATUS_LABELS[to]} — Seu Zuca`,
      html: `<p>O status do seu pedido mudou para <strong>${ORDER_STATUS_LABELS[to]}</strong>.</p>
             <p>${note}</p>
             <p><a href="${appUrl}/pedidos/${orderId}">Ver detalhes do pedido</a></p>`,
    });
  }
}

export async function buyerCancelOrderAction(orderId: string): Promise<FormState> {
  const buyer = await requireApprovedUser(["comprador"]);
  const order = await db.query.orders.findFirst({ where: eq(schema.orders.id, orderId) });
  if (!order || order.buyerId !== buyer.id) return { status: "error", message: "Pedido não encontrado." };
  if (!canTransition(order.status, "cancelado", "comprador")) {
    return { status: "error", message: "Este pedido não pode mais ser cancelado." };
  }
  await applyOrderStatusTransition(orderId, "cancelado", "Cancelado pelo comprador.", buyer.id);
  return { status: "success", message: "Pedido cancelado." };
}

export async function buyerOpenDisputeAction(orderId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const buyer = await requireApprovedUser(["comprador"]);
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { status: "error", fieldErrors: { reason: ["Descreva o problema."] } };

  const order = await db.query.orders.findFirst({ where: eq(schema.orders.id, orderId) });
  if (!order || order.buyerId !== buyer.id) return { status: "error", message: "Pedido não encontrado." };
  if (!canTransition(order.status, "em_disputa", "comprador")) {
    return { status: "error", message: "Não é possível abrir uma disputa para este pedido." };
  }
  await applyOrderStatusTransition(orderId, "em_disputa", `Disputa aberta pelo comprador: ${reason}`, buyer.id);
  return { status: "success", message: "Disputa registrada. Nossa equipe vai analisar o pedido." };
}

export async function buyerConfirmDeliveryAction(orderId: string): Promise<FormState> {
  const buyer = await requireApprovedUser(["comprador"]);
  const order = await db.query.orders.findFirst({ where: eq(schema.orders.id, orderId) });
  if (!order || order.buyerId !== buyer.id) return { status: "error", message: "Pedido não encontrado." };
  if (!canTransition(order.status, "entregue", "comprador")) {
    return { status: "error", message: "Este pedido ainda não pode ser confirmado como entregue." };
  }
  await applyOrderStatusTransition(orderId, "entregue", "Entrega confirmada pelo comprador.", buyer.id);
  return { status: "success", message: "Entrega confirmada." };
}

export async function supplierAdvanceOrderAction(orderId: string, target: "em_separacao" | "entregue"): Promise<FormState> {
  const supplier = await requireApprovedUser(["fornecedor"]);
  const order = await db.query.orders.findFirst({ where: eq(schema.orders.id, orderId) });
  if (!order || order.supplierId !== supplier.id) return { status: "error", message: "Pedido não encontrado." };
  if (!canTransition(order.status, target, "fornecedor")) {
    return { status: "error", message: "Transição de status inválida para este pedido." };
  }
  const notes: Record<string, string> = {
    em_separacao: "Pedido em separação.",
    entregue: "Entrega confirmada pelo fornecedor.",
  };
  await applyOrderStatusTransition(orderId, target, notes[target], supplier.id);
  return { status: "success" };
}

export async function supplierShipOrderAction(orderId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const supplier = await requireApprovedUser(["fornecedor"]);
  const trackingCode = String(formData.get("trackingCode") ?? "").trim();
  if (!trackingCode) return { status: "error", fieldErrors: { trackingCode: ["Informe o código de rastreio."] } };

  const order = await db.query.orders.findFirst({ where: eq(schema.orders.id, orderId) });
  if (!order || order.supplierId !== supplier.id) return { status: "error", message: "Pedido não encontrado." };
  if (!canTransition(order.status, "enviado", "fornecedor")) {
    return { status: "error", message: "Este pedido não pode ser marcado como enviado agora." };
  }

  await db.update(schema.orders).set({ trackingCode, updatedAt: new Date() }).where(eq(schema.orders.id, orderId));
  await applyOrderStatusTransition(orderId, "enviado", `Enviado. Código de rastreio: ${trackingCode}`, supplier.id);
  return { status: "success", message: "Pedido marcado como enviado." };
}

/**
 * SPEC.md §10, LOG-05: the fornecedor checks the buyer's pickup code in person and confirms —
 * this is the "retirada" equivalent of supplierShipOrderAction, jumping straight from
 * em_separacao to entregue since nothing is "shipped" when the buyer collects the order
 * themselves. That direct jump only exists for this action, not in the general transition graph
 * (src/lib/order-status.ts) — canTransition deliberately isn't used here.
 */
export async function supplierConfirmPickupAction(orderId: string): Promise<FormState> {
  const supplier = await requireApprovedUser(["fornecedor"]);
  const order = await db.query.orders.findFirst({ where: eq(schema.orders.id, orderId) });
  if (!order || order.supplierId !== supplier.id) return { status: "error", message: "Pedido não encontrado." };
  if (order.deliveryModality !== "retirada") {
    return { status: "error", message: "Este pedido não é uma retirada." };
  }
  if (order.status !== "em_separacao") {
    return { status: "error", message: "O pedido precisa estar em separação antes de confirmar a retirada." };
  }

  const pickupCode = await db.query.pickupCodes.findFirst({ where: eq(schema.pickupCodes.orderId, orderId) });
  if (!pickupCode || pickupCode.used) {
    return { status: "error", message: "Código de retirada inválido ou já utilizado." };
  }

  await db.update(schema.pickupCodes).set({ used: true, usedAt: new Date() }).where(eq(schema.pickupCodes.id, pickupCode.id));
  await applyOrderStatusTransition(orderId, "entregue", "Retirada confirmada pelo fornecedor.", supplier.id);
  return { status: "success", message: "Retirada confirmada." };
}

/**
 * Nota fiscal isn't itself an order-status transition, so this doesn't go through
 * applyOrderStatusTransition/canTransition — it just requires the order to already be paid
 * (issuing an invoice before payment makes no sense) and not cancelled.
 */
export async function supplierAttachInvoiceAction(orderId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const supplier = await requireApprovedUser(["fornecedor"]);
  const file = formData.get("invoiceFile");
  const invoiceFile = file instanceof File && file.size > 0 ? file : null;
  const fileError = validateInvoiceFile(invoiceFile, { required: true });
  if (fileError) return { status: "error", fieldErrors: { invoiceFile: [fileError] } };

  const order = await db.query.orders.findFirst({ where: eq(schema.orders.id, orderId) });
  if (!order || order.supplierId !== supplier.id) return { status: "error", message: "Pedido não encontrado." };
  if (order.status === "aguardando_pagamento" || order.status === "cancelado") {
    return { status: "error", message: "Este pedido ainda não pode receber nota fiscal." };
  }

  let invoiceUrl: string;
  try {
    invoiceUrl = await uploadInvoiceDocument(invoiceFile!, "invoices");
  } catch (error) {
    console.error("Falha ao enviar nota fiscal:", error);
    return { status: "error", fieldErrors: { invoiceFile: ["Falha ao enviar o arquivo. Tente novamente em instantes."] } };
  }
  await db
    .update(schema.orders)
    .set({ invoiceUrl, invoiceFileName: invoiceFile!.name, invoiceUploadedAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.orders.id, orderId));
  await logAudit({ actorId: supplier.id, action: "order.invoice_attached", entityType: "order", entityId: orderId, after: { fileName: invoiceFile!.name } });

  revalidatePath(`/pedidos/${orderId}`);
  revalidatePath("/pedidos");
  revalidatePath("/minha-conta");
  revalidatePath("/fornecedor/painel");
  return { status: "success", message: "Nota fiscal anexada." };
}
