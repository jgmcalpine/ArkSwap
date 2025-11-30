export { PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';

// Export model types using Prisma's generated types
export type AspDefinition = Prisma.AspDefinitionGetPayload<{}>;
export type ScannedBlock = Prisma.ScannedBlockGetPayload<{}>;
export type ArkRound = Prisma.ArkRoundGetPayload<{}>;
export type { Prisma };

