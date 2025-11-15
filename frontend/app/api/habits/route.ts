import { NextRequest, NextResponse } from 'next/server'

// Placeholder API routes for habits CRUD
export async function GET(request: NextRequest) {
  // TODO: Implement GET habits
  return NextResponse.json({ habits: [] })
}

export async function POST(request: NextRequest) {
  // TODO: Implement POST habit
  const body = await request.json()
  return NextResponse.json({ message: 'Habit created', data: body })
}

