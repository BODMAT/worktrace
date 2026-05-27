import { cache } from "react";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/server/cookies";
import { verifyJwt } from "@/server/jwt";
import { findUserById, type UserHeader } from "@/server/users";

export type CurrentUser = UserHeader & { id: string };

// Cached per React render: layout + page in the same request share one verify + one db read.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  let userId: string;
  try {
    ({ sub: userId } = await verifyJwt(token));
  } catch {
    return null;
  }

  const user = await findUserById(userId);
  if (!user) return null;

  return { id: userId, ...user };
});
