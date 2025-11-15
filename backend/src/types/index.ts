export interface Habit {
  id: string
  name: string
  description?: string
  userId: string
  createdAt: string
  updatedAt: string
  streak?: number
  frequency?: 'daily' | 'weekly' | 'custom'
}

export interface HabitEntry {
  id: string
  habitId: string
  date: string
  completed: boolean
  notes?: string
  createdAt: string
}

export interface User {
  id: string
  nostrPubkey: string
  username?: string
  email?: string
  createdAt: string
}

