import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma, Prisma } from "@kdp/db";
import { sectionLayoutSchema, type SectionLayout } from "@kdp/shared";
import { getOrCreateCurrentUser } from "@/lib/current-user";

/** A layout column write: the given layout object, or Prisma's JsonNull sentinel to reset it — a plain JS `null` isn't a valid Json-column value in Prisma. The cast is just for the Json column's index-signature-shaped input type; SectionLayout's two string fields are already plain JSON. */
function layoutWrite(value: SectionLayout | null): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value ? ({ ...value } as Prisma.InputJsonValue) : Prisma.JsonNull;
}

const updateCustomPageSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  subtitle: z.string().trim().max(160).optional(),
  content: z.string().trim().max(2000).optional(),
  titleLayout: sectionLayoutSchema.nullable().optional(),
  subtitleLayout: sectionLayoutSchema.nullable().optional(),
  contentLayout: sectionLayoutSchema.nullable().optional(),
});

/** Parses a Json layout column back into a SectionLayout, or null for anything malformed/absent — same fallback the renderer itself uses (see apps/worker/src/process-job.ts). */
function asSectionLayout(value: unknown): SectionLayout | null {
  const parsed = sectionLayoutSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getOrCreateCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.customPage.findFirst({ where: { id, userId: user.id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = updateCustomPageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const customPage = await prisma.customPage.update({
    where: { id: existing.id },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.subtitle !== undefined ? { subtitle: parsed.data.subtitle || null } : {}),
      ...(parsed.data.content !== undefined ? { content: parsed.data.content || null } : {}),
      ...(parsed.data.titleLayout !== undefined
        ? { titleLayout: layoutWrite(parsed.data.titleLayout) }
        : {}),
      ...(parsed.data.subtitleLayout !== undefined
        ? { subtitleLayout: layoutWrite(parsed.data.subtitleLayout) }
        : {}),
      ...(parsed.data.contentLayout !== undefined
        ? { contentLayout: layoutWrite(parsed.data.contentLayout) }
        : {}),
    },
  });
  return NextResponse.json({
    customPage: {
      ...customPage,
      titleLayout: asSectionLayout(customPage.titleLayout),
      subtitleLayout: asSectionLayout(customPage.subtitleLayout),
      contentLayout: asSectionLayout(customPage.contentLayout),
    },
  });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getOrCreateCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const customPage = await prisma.customPage.findFirst({ where: { id, userId: user.id } });
  if (!customPage) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Assets that were filed under this page aren't deleted — the FK is
  // ON DELETE SET NULL (see schema.prisma), so they just fall back to
  // unfiled, the same as an album's images did before custom pages existed.
  await prisma.customPage.delete({ where: { id: customPage.id } });

  return NextResponse.json({ ok: true });
}
