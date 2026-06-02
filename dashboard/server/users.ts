import { prisma } from "@/server/db";

export type UserHeader = {
  email:   string;
  name:    string | null;
  picture: string | null;
};

export async function findUserById(id: string): Promise<UserHeader | null> {
  return prisma.user.findUnique({
    where:  { id },
    select: { email: true, name: true, picture: true },
  });
}
