import { tauriApi } from '@/lib/api';
import type { Diagram } from '@/diagram/types';

export const diagramService = {
  save: async (diagram: Diagram): Promise<Diagram> => {
    return await tauriApi.invoke<Diagram>('save_diagram', { diagram });
  },

  get: async (id: string): Promise<Diagram> => {
    return await tauriApi.invoke<Diagram>('get_diagram', { id });
  },

  list: async (): Promise<Diagram[]> => {
    return await tauriApi.invoke<Diagram[]>('list_diagrams');
  },

  remove: async (id: string): Promise<void> => {
    return await tauriApi.invoke<void>('delete_diagram', { id });
  },
};
