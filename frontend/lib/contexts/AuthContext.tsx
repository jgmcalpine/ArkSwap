'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'
import { getPublicKey, isNIP07Available } from '../nostr/nip07'

interface AuthContextType {
  isAuthenticated: boolean
  pubkey: string | null
  isLoading: boolean
  login: () => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [pubkey, setPubkey] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Check for existing session
    const storedPubkey = localStorage.getItem('nostr_pubkey')
    if (storedPubkey) {
      setPubkey(storedPubkey)
      setIsAuthenticated(true)
    }
    setIsLoading(false)
  }, [])

  const login = async () => {
    try {
      const available = await isNIP07Available()
      if (!available) {
        alert('Nostr extension not found. Please install a Nostr extension like Alby or nos2x.')
        return
      }

      const key = await getPublicKey()
      if (key) {
        setPubkey(key)
        setIsAuthenticated(true)
        localStorage.setItem('nostr_pubkey', key)
        // TODO: Call backend to authenticate and get session token
      }
    } catch (error) {
      console.error('Login error:', error)
    }
  }

  const logout = () => {
    setPubkey(null)
    setIsAuthenticated(false)
    localStorage.removeItem('nostr_pubkey')
  }

  return (
    <AuthContext.Provider value={{ isAuthenticated, pubkey, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

