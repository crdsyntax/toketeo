import { tauriApi } from '@/lib/api'
import type { Character } from '@/types/character'

export const characterService = {
  get: async (): Promise<Character> => {
    return await tauriApi.invoke<Character>('get_character')
  },

  save: async (character: Character): Promise<void> => {
    return await tauriApi.invoke<void>('save_character', { character })
  },
}
