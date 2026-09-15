"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth/require-user";
import { uploadFile } from "@/lib/storage";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import type { FormState } from "./form-state";

function revalidateBannerSurfaces() {
  revalidatePath("/admin/banners");
  revalidatePath("/");
}

const bannerSchema = z.object({
  title: z.string().trim().min(2, "Informe o título"),
  highlight: z.string().trim().optional(),
  subtitle: z.string().trim().optional(),
  link: z.string().trim().optional(),
});

export async function createBannerAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireUser(["admin"]);
  const parsed = bannerSchema.safeParse({
    title: formData.get("title"),
    highlight: formData.get("highlight") || undefined,
    subtitle: formData.get("subtitle") || undefined,
    link: formData.get("link") || undefined,
  });
  if (!parsed.success) return { status: "error", fieldErrors: parsed.error.flatten().fieldErrors };

  const image = formData.get("image");
  if (!(image instanceof File) || image.size === 0) {
    return { status: "error", fieldErrors: { image: ["Envie uma imagem para o banner."] } };
  }
  let imageUrl: string;
  try {
    imageUrl = await uploadFile(image, "banners");
  } catch (error) {
    console.error("Falha ao enviar imagem do banner:", error);
    return { status: "error", fieldErrors: { image: ["Falha ao enviar a imagem. Tente novamente em instantes."] } };
  }

  const maxOrder = await db.query.banners.findFirst({ orderBy: (b, { desc }) => [desc(b.order)] });

  const [banner] = await db
    .insert(schema.banners)
    .values({
      title: parsed.data.title,
      highlight: parsed.data.highlight || null,
      subtitle: parsed.data.subtitle || null,
      imageUrl,
      link: parsed.data.link || null,
      order: (maxOrder?.order ?? -1) + 1,
      active: true,
    })
    .returning({ id: schema.banners.id });

  await logAudit({ actorId: admin.id, action: "banner.create", entityType: "banner", entityId: banner.id });
  revalidateBannerSurfaces();
  return { status: "success", message: "Banner criado." };
}

export async function updateBannerAction(bannerId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireUser(["admin"]);
  const parsed = bannerSchema.safeParse({
    title: formData.get("title"),
    highlight: formData.get("highlight") || undefined,
    subtitle: formData.get("subtitle") || undefined,
    link: formData.get("link") || undefined,
  });
  if (!parsed.success) return { status: "error", fieldErrors: parsed.error.flatten().fieldErrors };

  const before = await db.query.banners.findFirst({ where: eq(schema.banners.id, bannerId) });
  if (!before) return { status: "error", message: "Banner não encontrado." };

  const image = formData.get("image");
  let imageUrl = before.imageUrl;
  if (image instanceof File && image.size > 0) {
    try {
      imageUrl = await uploadFile(image, "banners");
    } catch (error) {
      console.error("Falha ao enviar imagem do banner:", error);
      return { status: "error", fieldErrors: { image: ["Falha ao enviar a imagem. Tente novamente em instantes."] } };
    }
  }

  await db
    .update(schema.banners)
    .set({
      title: parsed.data.title,
      highlight: parsed.data.highlight || null,
      subtitle: parsed.data.subtitle || null,
      imageUrl,
      link: parsed.data.link || null,
    })
    .where(eq(schema.banners.id, bannerId));

  await logAudit({ actorId: admin.id, action: "banner.update", entityType: "banner", entityId: bannerId, before });
  revalidateBannerSurfaces();
  return { status: "success", message: "Banner atualizado." };
}

export async function toggleBannerActiveAction(bannerId: string, nextActive: boolean) {
  const admin = await requireUser(["admin"]);
  const before = await db.query.banners.findFirst({ where: eq(schema.banners.id, bannerId) });
  if (!before) return;

  await db.update(schema.banners).set({ active: nextActive }).where(eq(schema.banners.id, bannerId));
  await logAudit({
    actorId: admin.id,
    action: nextActive ? "banner.activate" : "banner.deactivate",
    entityType: "banner",
    entityId: bannerId,
    before,
  });
  revalidateBannerSurfaces();
}

export async function deleteBannerAction(bannerId: string) {
  const admin = await requireUser(["admin"]);
  const before = await db.query.banners.findFirst({ where: eq(schema.banners.id, bannerId) });
  if (!before) return;

  await db.delete(schema.banners).where(eq(schema.banners.id, bannerId));
  await logAudit({ actorId: admin.id, action: "banner.delete", entityType: "banner", entityId: bannerId, before });
  revalidateBannerSurfaces();
}

/** Persists a new drag-and-drop order — `orderedIds` is the full banner id list in its new
 * display order, index becomes the stored `order`. */
export async function reorderBannersAction(orderedIds: string[]) {
  const admin = await requireUser(["admin"]);
  await Promise.all(orderedIds.map((id, index) => db.update(schema.banners).set({ order: index }).where(eq(schema.banners.id, id))));
  await logAudit({ actorId: admin.id, action: "banner.reorder", entityType: "banner", entityId: "bulk", after: { orderedIds } });
  revalidateBannerSurfaces();
}
