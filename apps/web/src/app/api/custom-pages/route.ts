import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@kdp/db";
import { CUSTOM_PAGE_SECTIONS, sectionLayoutSchema, type SectionLayout } from "@kdp/shared";
import { getOrCreateCurrentUser } from "@/lib/current-user";

const createCustomPageSchema = z.object({
  name: z.string().trim().min(1).max(60),
  subtitle: z.string().trim().max(160).optional(),
  content: z.string().trim().max(2000).optional(),
  section: z.enum(CUSTOM_PAGE_SECTIONS),
  position: z.number().int().min(0).max(999).default(0),
  titleLayout: sectionLayoutSchema.optional(),
  subtitleLayout: sectionLayoutSchema.optional(),
  contentLayout: sectionLayoutSchema.optional(),
});

/** Parses a Json layout column back into a SectionLayout, or null for anything malformed/absent — same fallback the renderer itself uses (see apps/worker/src/process-job.ts). */
function asSectionLayout(value: unknown): SectionLayout | null {
  const parsed = sectionLayoutSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function serialize(page: {
  titleLayout: unknown;
  subtitleLayout: unknown;
  contentLayout: unknown;
  [key: string]: unknown;
}) {
  return {
    ...page,
    titleLayout: asSectionLayout(page.titleLayout),
    subtitleLayout: asSectionLayout(page.subtitleLayout),
    contentLayout: asSectionLayout(page.contentLayout),
  };
}

export async function GET() {
  const user = await getOrCreateCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await prisma.customPage.findMany({
    where: { userId: user.id },
    orderBy: [{ section: "asc" }, { position: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json({ customPages: rows.map(serialize) });
}

export async function POST(request: Request) {
  const user = await getOrCreateCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = createCustomPageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const customPage = await prisma.customPage.create({
    data: {
      userId: user.id,
      name: parsed.data.name,
      subtitle: parsed.data.subtitle || null,
      content: parsed.data.content || null,
      section: parsed.data.section,
      position: parsed.data.position,
      titleLayout: parsed.data.titleLayout ?? undefined,
      subtitleLayout: parsed.data.subtitleLayout ?? undefined,
      contentLayout: parsed.data.contentLayout ?? undefined,
    },
  });
  return NextResponse.json({ customPage: serialize(customPage) }, { status: 201 });
}
