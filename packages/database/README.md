# @arkswap/database

Database package for ArkWatch using Prisma ORM.

## Setup

1. Set the `DATABASE_URL` environment variable:
   ```
   DATABASE_URL="postgresql://arkswap:arkswap@localhost:5432/arkswap"
   ```

2. Generate Prisma Client:
   ```bash
   pnpm prisma:generate
   ```

3. Run migrations:
   ```bash
   pnpm prisma:migrate
   ```

## Schema

The database schema includes:
- `AspDefinition`: Service provider definitions
- `ScannedBlock`: Blocks that have been processed
- `ArkRound`: Rounds detected on-chain, linked to specific ASPs

