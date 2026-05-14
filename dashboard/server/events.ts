import type { CreateEventInput } from "./schemas/events";
import { prisma } from "./db";

export function createEvent(input: CreateEventInput) {
  return prisma.event.create({ data: input });
}
