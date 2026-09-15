"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, and, asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireApprovedUser } from "@/lib/auth/require-user";
import { productSchema, reaisToCents } from "@/lib/validation/catalog";
import { generateUniqueSlug } from "@/lib/slug";
import { uploadFile } from "@/lib/storage";
import { logAudit } from "@/lib/audit";
import type { FormState } from "./form-state";

function parseProductForm(formData: FormData) {
  return productSchema.safeParse({
    name: formData.get("name"),
    categoryId: formData.get("categoryId"),
    unitId: formData.get("unitId"),
    sku: formData.get("sku"),
    description: formData.get("description"),
    priceReais: formData.get("priceReais"),
    stock: formData.get("stock"),
    leadTimeDays: formData.get("leadTimeDays"),
    weightGrams: formData.get("weightGrams"),
    lengthCm: formData.get("lengthCm"),
    widthCm: formData.get("widthCm"),
    heightCm: formData.get("heightCm"),
  });
}

function imageFiles(formData: FormData): File[] {
  return formData.getAll("images").filter((v): v is File => v instanceof File && v.size > 0);
}

export async function createProductAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const supplier = await requireApprovedUser(["fornecedor"]);
  const parsed = parseProductForm(formData);
  if (!parsed.success) {
    return { status: "error", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const data = parsed.data;

  const category = await db.query.categories.findFirst({ where: eq(schema.categories.id, data.categoryId) });
  if (!category) {
    return { status: "error", fieldErrors: { categoryId: ["Categoria inválida."] } };
  }
  const unit = await db.query.units.findFirst({ where: eq(schema.units.id, data.unitId) });
  if (!unit) {
    return { status: "error", fieldErrors: { unitId: ["Unidade inválida."] } };
  }

  const slug = await generateUniqueSlug(data.name, async (candidate) => {
    const existing = await db.query.products.findFirst({ where: eq(schema.products.slug, candidate) });
    return !!existing;
  });

  const files = imageFiles(formData);
  let imageUrls: string[];
  try {
    imageUrls = await Promise.all(files.map((file) => uploadFile(file, "products")));
  } catch (error) {
    console.error("Falha ao enviar imagens do produto:", error);
    return { status: "error", fieldErrors: { images: ["Falha ao enviar as imagens. Tente novamente em instantes."] } };
  }

  const [product] = await db
    .insert(schema.products)
    .values({
      supplierId: supplier.id,
      categoryId: data.categoryId,
      unitId: data.unitId,
      name: data.name,
      slug,
      sku: data.sku,
      description: data.description,
      priceCents: reaisToCents(data.priceReais),
      stock: data.stock,
      leadTimeDays: data.leadTimeDays,
      weightGrams: data.weightGrams,
      lengthCm: data.lengthCm,
      widthCm: data.widthCm,
      heightCm: data.heightCm,
      moderationStatus: "aguardando_aprovacao",
    })
    .returning();

  if (imageUrls.length > 0) {
    await db
      .insert(schema.productImages)
      .values(imageUrls.map((url, order) => ({ productId: product.id, url, order })));
  }

  await logAudit({
    actorId: supplier.id,
    action: "product.create",
    entityType: "product",
    entityId: product.id,
    after: product,
  });

  revalidatePath("/fornecedor/painel");
  revalidatePath("/admin/produtos");
  redirect("/fornecedor/painel?tab=produtos");
}

export async function updateProductAction(
  productId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const supplier = await requireApprovedUser(["fornecedor"]);

  const before = await db.query.products.findFirst({ where: eq(schema.products.id, productId) });
  if (!before || before.supplierId !== supplier.id) {
    return { status: "error", message: "Produto não encontrado." };
  }

  const parsed = parseProductForm(formData);
  if (!parsed.success) {
    return { status: "error", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const data = parsed.data;

  const category = await db.query.categories.findFirst({ where: eq(schema.categories.id, data.categoryId) });
  if (!category) return { status: "error", fieldErrors: { categoryId: ["Categoria inválida."] } };
  const unit = await db.query.units.findFirst({ where: eq(schema.units.id, data.unitId) });
  if (!unit) return { status: "error", fieldErrors: { unitId: ["Unidade inválida."] } };

  const removedImageIds = formData.getAll("removeImage").filter((v): v is string => typeof v === "string");
  const newFiles = imageFiles(formData);
  let newImageUrls: string[];
  try {
    newImageUrls = await Promise.all(newFiles.map((file) => uploadFile(file, "products")));
  } catch (error) {
    console.error("Falha ao enviar imagens do produto:", error);
    return { status: "error", fieldErrors: { images: ["Falha ao enviar as imagens. Tente novamente em instantes."] } };
  }

  // Any edit through this form is treated as sensitive and re-opens moderation (ROADMAP Fase 2 /
  // CLAUDE.md), including stock-only tweaks — a lighter "quick stock update" action that skips
  // re-moderation could be added later without touching this flow.
  const [after] = await db
    .update(schema.products)
    .set({
      categoryId: data.categoryId,
      unitId: data.unitId,
      name: data.name,
      sku: data.sku,
      description: data.description,
      priceCents: reaisToCents(data.priceReais),
      stock: data.stock,
      leadTimeDays: data.leadTimeDays,
      weightGrams: data.weightGrams,
      lengthCm: data.lengthCm,
      widthCm: data.widthCm,
      heightCm: data.heightCm,
      moderationStatus: "aguardando_aprovacao",
      rejectionReason: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.products.id, productId))
    .returning();

  if (removedImageIds.length > 0) {
    for (const imageId of removedImageIds) {
      await db
        .delete(schema.productImages)
        .where(and(eq(schema.productImages.id, imageId), eq(schema.productImages.productId, productId)));
    }
  }
  if (newImageUrls.length > 0) {
    const existingCount = await db.query.productImages.findMany({
      where: eq(schema.productImages.productId, productId),
    });
    await db.insert(schema.productImages).values(
      newImageUrls.map((url, i) => ({ productId, url, order: existingCount.length + i })),
    );
  }

  await logAudit({
    actorId: supplier.id,
    action: "product.update",
    entityType: "product",
    entityId: productId,
    before,
    after,
  });

  revalidatePath("/fornecedor/painel");
  revalidatePath("/admin/produtos");
  revalidatePath(`/produto/${before.slug}`);
  redirect("/fornecedor/painel?tab=produtos");
}

export async function deactivateOwnProductAction(productId: string) {
  const supplier = await requireApprovedUser(["fornecedor"]);
  const before = await db.query.products.findFirst({ where: eq(schema.products.id, productId) });
  if (!before || before.supplierId !== supplier.id) return;

  const [after] = await db
    .update(schema.products)
    .set({ moderationStatus: "inativo" })
    .where(eq(schema.products.id, productId))
    .returning();

  await logAudit({
    actorId: supplier.id,
    action: "product.deactivate",
    entityType: "product",
    entityId: productId,
    before,
    after,
  });
  revalidatePath("/fornecedor/painel");
  revalidatePath("/admin/produtos");
}

export async function reactivateOwnProductAction(productId: string) {
  const supplier = await requireApprovedUser(["fornecedor"]);
  const before = await db.query.products.findFirst({ where: eq(schema.products.id, productId) });
  if (!before || before.supplierId !== supplier.id) return;

  // Reactivating goes back through moderation too — the product may have sat inactive for a
  // while and the supplier could have changed stock/price in the meantime via a fresh edit.
  const [after] = await db
    .update(schema.products)
    .set({ moderationStatus: "aguardando_aprovacao" })
    .where(eq(schema.products.id, productId))
    .returning();

  await logAudit({
    actorId: supplier.id,
    action: "product.reactivate",
    entityType: "product",
    entityId: productId,
    before,
    after,
  });
  revalidatePath("/fornecedor/painel");
  revalidatePath("/admin/produtos");
}

export async function listCategoriesForProductForm() {
  return db.query.categories.findMany({ where: eq(schema.categories.active, true), orderBy: asc(schema.categories.name) });
}

export async function listUnitsForProductForm() {
  return db.query.units.findMany({ orderBy: asc(schema.units.name) });
}
