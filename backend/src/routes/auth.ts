import { Router, Request, Response } from 'express'
import { createOrGetUser, verifyNostrSignature } from '../services/auth/authService'

const router = Router()

// POST /api/auth/nostr - Authenticate with Nostr
router.post('/nostr', async (req: Request, res: Response) => {
  try {
    const { pubkey, message, signature } = req.body
    
    if (!pubkey || !message || !signature) {
      return res.status(400).json({ error: 'Missing required fields' })
    }
    
    // Verify signature
    const isValid = await verifyNostrSignature(pubkey, message, signature)
    
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid signature' })
    }
    
    // Create or get user
    const user = await createOrGetUser(pubkey)
    
    if (!user) {
      return res.status(500).json({ error: 'Failed to create/get user' })
    }
    
    // TODO: Generate JWT or session token
    res.json({ 
      message: 'Authentication successful - TODO: Implement token generation',
      user 
    })
  } catch (error) {
    res.status(500).json({ error: 'Authentication failed' })
  }
})

export default router

