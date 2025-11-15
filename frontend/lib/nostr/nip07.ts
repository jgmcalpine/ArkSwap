export interface NIP07Window {
  nostr?: {
    getPublicKey(): Promise<string>
    signEvent(event: { kind: number; created_at: number; tags: string[][]; content: string }): Promise<{ id: string; sig: string; [key: string]: any }>
  }
}

declare global {
  interface Window extends NIP07Window {}
}

export async function isNIP07Available(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  return typeof window.nostr !== 'undefined'
}

export async function getPublicKey(): Promise<string | null> {
  if (!(await isNIP07Available())) {
    return null
  }
  
  try {
    return await window.nostr!.getPublicKey()
  } catch (error) {
    console.error('Error getting public key:', error)
    return null
  }
}

export async function signEvent(event: {
  kind: number
  created_at: number
  tags: string[][]
  content: string
}): Promise<{ id: string; sig: string; [key: string]: any } | null> {
  if (!(await isNIP07Available())) {
    return null
  }
  
  try {
    return await window.nostr!.signEvent(event)
  } catch (error) {
    console.error('Error signing event:', error)
    return null
  }
}

