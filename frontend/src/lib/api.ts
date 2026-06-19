import { invoke } from '@tauri-apps/api/core';

export const tauriApi = {
  invoke: async <T>(
    command: string,
    args: Record<string, unknown> = {},
  ): Promise<T> => {
    try {
      const response = await invoke<T>(command, args);
      return response;
    } catch (error: unknown) {
      console.error(`[Tauri Error] Command ${command} failed:`, error);

      let message = 'Internal Rust Error';

      if (typeof error === 'string') {
        message = error;
      } else if (error && typeof error === 'object') {
        const keys = Object.keys(error);
        if (keys.length === 1) {
          const variant = keys[0];
          const content = (error as Record<string, unknown>)[variant];
          message =
            typeof content === 'string' ? content : JSON.stringify(content);
        } else if ('message' in error) {
          message = String(error.message);
        }
      }

      throw new Error(message, { cause: error });
    }
  },
};

export const apiClient = {
  get: async <T>(url: string) => ({
    data: await tauriApi.invoke<T>(
      'get_' +
        url
          .split('/')
          .pop()
          ?.replace(/[^a-zA-Z0-9]/g, '_'),
    ),
  }),
  post: async <T>(url: string, data?: unknown) => ({
    data: await tauriApi.invoke<T>(
      url
        .split('/')
        .pop()
        ?.replace(/[^a-zA-Z0-9]/g, '_') || 'post',
      data as Record<string, unknown>,
    ),
  }),
  patch: async <T>(url: string, data?: unknown) => ({
    data: await tauriApi.invoke<T>('update_' + url.split('/')[1], {
      id: url.split('/')[2],
      ...(data as Record<string, unknown>),
    }),
  }),
  delete: async (url: string) => {
    await tauriApi.invoke('delete_' + url.split('/')[1], {
      id: url.split('/')[2],
    });
  },
};

export function getApiUrl(path: string): string {
  return `tauri://api${path}`;
}
