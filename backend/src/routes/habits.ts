import { Router, Request, Response } from 'express'
import { getHabits, createHabit, updateHabit, deleteHabit } from '../controllers/habitsController'

const router = Router()

// GET /api/habits - Get all habits
router.get('/', getHabits)

// GET /api/habits/:id - Get habit by ID
router.get('/:id', (req: Request, res: Response) => {
  // TODO: Implement get habit by ID
  res.json({ message: 'Get habit by ID - TODO' })
})

// POST /api/habits - Create a new habit
router.post('/', createHabit)

// PUT /api/habits/:id - Update a habit
router.put('/:id', updateHabit)

// DELETE /api/habits/:id - Delete a habit
router.delete('/:id', deleteHabit)

export default router

