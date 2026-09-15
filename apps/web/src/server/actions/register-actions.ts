"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Role } from "@/lib/auth/roles";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { onlyDigits } from "@/lib/cnpj";
import { geocodeAddress } from "@/lib/openrouteservice";
import { uploadKycDocument } from "@/lib/storage";
import { generateUniqueSlug } from "@/lib/slug";
import { companyStepSchema } from "@/lib/validation/register";
import { validateDocumentFile } from "@/lib/validation/files";
import { type FormState } from "./form-state";

function fileOrNull(value: FormDataEntryValue | null): File | null {
  return value instanceof File && value.size > 0 ? value : null;
}

async function registerCompanyAccount(role: Role, formData: FormData): Promise<FormState> {
  const parsed = companyStepSchema.safeParse({
    razaoSocial: formData.get("razaoSocial"),
    nomeFantasia: formData.get("nomeFantasia"),
    cnpj: formData.get("cnpj"),
    email: formData.get("email"),
    telefone: formData.get("telefone"),
    ramoAtividade: formData.get("ramoAtividade"),
    cep: formData.get("cep"),
    logradouro: formData.get("logradouro"),
    numero: formData.get("numero"),
    complemento: formData.get("complemento") || undefined,
    bairro: formData.get("bairro"),
    cidade: formData.get("cidade"),
    estado: formData.get("estado"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { status: "error", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const cartaoCnpjFile = fileOrNull(formData.get("cartaoCnpjFile"));
  const contratoSocialFile = fileOrNull(formData.get("contratoSocialFile"));
  const outrosFiles = formData.getAll("outrosFiles").filter((v): v is File => v instanceof File && v.size > 0);

  const fileErrors: Record<string, string[]> = {};
  const cartaoError = validateDocumentFile(cartaoCnpjFile, { required: true });
  if (cartaoError) fileErrors.cartaoCnpjFile = [cartaoError];
  const contratoError = validateDocumentFile(contratoSocialFile, { required: true });
  if (contratoError) fileErrors.contratoSocialFile = [contratoError];
  for (const file of outrosFiles) {
    const error = validateDocumentFile(file, { required: false });
    if (error) {
      fileErrors.outrosFiles = [error];
      break;
    }
  }
  if (Object.keys(fileErrors).length > 0) {
    return { status: "error", fieldErrors: fileErrors };
  }

  const data = parsed.data;
  const email = data.email.toLowerCase();
  const cnpj = onlyDigits(data.cnpj);

  const [existingEmail, existingCnpj] = await Promise.all([
    db.query.users.findFirst({ where: eq(schema.users.email, email) }),
    db.query.companies.findFirst({ where: eq(schema.companies.cnpj, cnpj) }),
  ]);
  if (existingEmail) {
    return { status: "error", fieldErrors: { email: ["Já existe uma conta com este e-mail."] } };
  }
  if (existingCnpj) {
    return { status: "error", fieldErrors: { cnpj: ["Já existe uma conta cadastrada com este CNPJ."] } };
  }

  // Uploads happen outside the DB transaction (external I/O); the transaction only persists rows.
  const uploads: { type: "cartao_cnpj" | "contrato_social" | "outro"; fileName: string; fileUrl: string }[] = [];
  try {
    uploads.push({
      type: "cartao_cnpj",
      fileName: cartaoCnpjFile!.name,
      fileUrl: await uploadKycDocument(cartaoCnpjFile!, "kyc"),
    });
    uploads.push({
      type: "contrato_social",
      fileName: contratoSocialFile!.name,
      fileUrl: await uploadKycDocument(contratoSocialFile!, "kyc"),
    });
    for (const file of outrosFiles) {
      uploads.push({ type: "outro", fileName: file.name, fileUrl: await uploadKycDocument(file, "kyc") });
    }
  } catch (error) {
    console.error("Falha ao enviar documentos de KYC:", error);
    return { status: "error", message: "Falha ao enviar os documentos. Tente novamente em instantes." };
  }

  const passwordHash = await hashPassword(data.password);

  // Geocoding is external I/O — resolved before the transaction, same reasoning as the uploads
  // above. Never blocks signup: null coordinates just mean raio coverage/route-distance freight
  // can't be computed for this address yet (SPEC.md §10, LOG-03's documented fallback).
  const coordinates = await geocodeAddress({
    cep: onlyDigits(data.cep),
    logradouro: data.logradouro,
    numero: data.numero,
    cidade: data.cidade,
    estado: data.estado,
  });

  // Only suppliers get a public storefront (/fornecedor/[slug]) — generated once at signup so
  // the URL stays stable even if the trade name changes later.
  const companySlug =
    role === "fornecedor"
      ? await generateUniqueSlug(data.nomeFantasia, async (candidate) => {
          const existing = await db.query.companies.findFirst({ where: eq(schema.companies.slug, candidate) });
          return !!existing;
        })
      : null;

  let userId: string;
  try {
    userId = await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(schema.users)
        .values({ email, passwordHash, role, status: "pendente" })
        .returning({ id: schema.users.id });

      const [company] = await tx
        .insert(schema.companies)
        .values({
          userId: user.id,
          razaoSocial: data.razaoSocial,
          nomeFantasia: data.nomeFantasia,
          cnpj,
          telefone: data.telefone,
          ramoAtividade: data.ramoAtividade,
          slug: companySlug,
        })
        .returning({ id: schema.companies.id });

      await tx.insert(schema.addresses).values({
        companyId: company.id,
        type: "empresa",
        cep: onlyDigits(data.cep),
        logradouro: data.logradouro,
        numero: data.numero,
        complemento: data.complemento || null,
        bairro: data.bairro,
        cidade: data.cidade,
        estado: data.estado,
        isDefault: true,
        latitude: coordinates?.lat ?? null,
        longitude: coordinates?.lng ?? null,
      });

      await tx.insert(schema.kycDocuments).values(
        uploads.map((upload) => ({
          companyId: company.id,
          type: upload.type,
          fileName: upload.fileName,
          fileUrl: upload.fileUrl,
        })),
      );

      return user.id;
    });
  } catch {
    return {
      status: "error",
      message: "Não foi possível concluir o cadastro. Tente novamente em instantes.",
    };
  }

  await createSession(userId);
  redirect("/aguardando-aprovacao");
}

export async function registerBuyerAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  return registerCompanyAccount("comprador", formData);
}

export async function registerSupplierAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  return registerCompanyAccount("fornecedor", formData);
}
