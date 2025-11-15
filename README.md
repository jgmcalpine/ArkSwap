# Eventstr - Habit Tracking Platform

A habit tracking platform where users can track habits, discuss approaches in groups, and hire mentors to support their journey.

## Tech Stack

- **Frontend**: Next.js 14+ with TypeScript, TailwindCSS, NDK (Nostr Dev Kit), NIP-07
- **Backend**: Express with TypeScript, Supabase (PostgreSQL)
- **Deployment**: Vercel

## Project Structure

```
eventstr/
├── frontend/     # Next.js application
├── backend/      # Express server
└── package.json  # Workspace configuration
```

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Supabase account and project
- Nostr extension (for NIP-07 authentication)

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   - Copy `.env.example` to `.env` in the root directory
   - Fill in your Supabase credentials and other required values

4. Run the development servers:

   Frontend:
   ```bash
   npm run dev:frontend
   ```

   Backend:
   ```bash
   npm run dev:backend
   ```

### Building for Production

```bash
npm run build
```

## Development

- Frontend runs on `http://localhost:3000`
- Backend runs on `http://localhost:3001` (configurable via PORT env var)

## Deployment

The project is configured for Vercel deployment. See `vercel.json` for configuration details.

