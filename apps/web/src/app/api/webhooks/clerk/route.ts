import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { prisma } from "@kdp/db";
import { getEnv } from "@/lib/env";

// Clerk webhooks are unauthenticated HTTP requests from Clerk's servers, so
// this route is intentionally public in middleware.ts — the security check
// happens here instead, via HMAC signature verification (svix). Never trust
// the body of this request before verify() succeeds.
export async function POST(request: Request) {
  const { CLERK_WEBHOOK_SIGNING_SECRET } = getEnv();
  if (!CLERK_WEBHOOK_SIGNING_SECRET) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const payload = await request.text();
  const headers = {
    "svix-id": request.headers.get("svix-id") ?? "",
    "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
    "svix-signature": request.headers.get("svix-signature") ?? "",
  };

  // verify() is called for its THROW, and the body is parsed separately.
  //
  // svix 1 returned the parsed payload from verify(); svix 2 returns
  // nothing at all — the signature is `verify(...): undefined`. Reading a
  // return value that no longer exists is the shape of bug that survives
  // a type cast and dies in production: `as typeof event` compiles
  // happily, hands back undefined, and every Clerk webhook then throws on
  // `event.type`. Deleted users would stop being deleted, silently.
  //
  // Parsing here is correct on both majors and depends on nothing but the
  // one guarantee svix actually makes: an invalid signature throws.
  // JSON.parse throwing on a malformed body lands in the same branch,
  // which is right — an unverifiable request is not a request we act on.
  let event: { type: string; data: { id: string } };
  try {
    new Webhook(CLERK_WEBHOOK_SIGNING_SECRET).verify(payload, headers);
    event = JSON.parse(payload) as typeof event;
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "user.deleted") {
    await prisma.user.deleteMany({ where: { clerkId: event.data.id } });
  }

  return NextResponse.json({ received: true });
}
