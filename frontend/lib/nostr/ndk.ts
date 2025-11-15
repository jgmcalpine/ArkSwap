import NDK from '@nostr-dev-kit/ndk'

let ndkInstance: NDK | null = null

export function getNDK(): NDK {
  if (!ndkInstance) {
    const relayUrl = process.env.NEXT_PUBLIC_RELAY_URL || 'wss://relay.damus.io'
    
    ndkInstance = new NDK({
      explicitRelayUrls: [relayUrl],
    })
    
    ndkInstance.connect()
  }
  
  return ndkInstance
}

export function resetNDK() {
  ndkInstance = null
}

