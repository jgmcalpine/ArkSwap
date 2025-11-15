import { Request, Response } from 'express'
import { supabase } from '../config/supabase'

export async function getHabits(req: Request, res: Response) {
  try {
    // TODO: Implement actual database query
    // const { data, error } = await supabase.from('habits').select('*')
    res.json({ habits: [], message: 'Get habits - TODO: Implement database query' })
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch habits' })
  }
}

export async function createHabit(req: Request, res: Response) {
  try {
    const { name, description, userId } = req.body
    
    // TODO: Implement actual database insert
    // const { data, error } = await supabase.from('habits').insert({ name, description, userId })
    
    res.status(201).json({ 
      message: 'Habit created - TODO: Implement database insert',
      habit: { name, description, userId }
    })
  } catch (error) {
    res.status(500).json({ error: 'Failed to create habit' })
  }
}

export async function updateHabit(req: Request, res: Response) {
  try {
    const { id } = req.params
    const updates = req.body
    
    // TODO: Implement actual database update
    // const { data, error } = await supabase.from('habits').update(updates).eq('id', id)
    
    res.json({ 
      message: 'Habit updated - TODO: Implement database update',
      id,
      updates
    })
  } catch (error) {
    res.status(500).json({ error: 'Failed to update habit' })
  }
}

export async function deleteHabit(req: Request, res: Response) {
  try {
    const { id } = req.params
    
    // TODO: Implement actual database delete
    // const { error } = await supabase.from('habits').delete().eq('id', id)
    
    res.json({ 
      message: 'Habit deleted - TODO: Implement database delete',
      id
    })
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete habit' })
  }
}

