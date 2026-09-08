import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@kdp/db";

/**
 * Resolves the signed-in Clerk user to our local `User` row, creating it on
 * first sight (Clerk owns identity/auth; we only mirror the minimum needed
 * to attach rows to a user). Returns null if no one is signed in — callers
 * behind `clerkMiddleware().protect()` shouldn't normally hit that, but
 * never assume a non-null user without checking.
 */
export async function getOrCreateCurrentUser() {
  const { userId } = await auth();
  if (!userId) return null;

  const existing = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (existing) return existing;

  const clerkUser = await currentUser();
  const email = clerkUser?.primaryEmailAddress?.emailAddress;
  if (!email) {
    throw new Error(`Clerk user ${userId} has no primary email address`);
  }

  return prisma.user.create({
    data: { clerkId: userId, email },
  });
}
