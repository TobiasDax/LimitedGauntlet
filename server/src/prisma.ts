import { makePrismaClient } from "./db.js";

// The shared client for the running server. Tests and one-off scripts make
// their own via makePrismaClient() (see db.ts).
export const prisma = makePrismaClient();
