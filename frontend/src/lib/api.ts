import { invoke } from '@tauri-apps/api/core';

function extractError(error: unknown): string {
  if (typeof error === 'string') return error;

  if (error && typeof error === 'object') {

    const keys = Object.keys(error);
    if (keys.length === 1) {
      const variant = keys[0];
      const content = (error as Record<string, unknown>)[variant];
      if (typeof content === 'string') return content;
      return JSON.stringify(content);
    }


    if ('message' in error) {
      const msg = (error as { message: unknown }).message;
      if (typeof msg === 'string') return msg;
    }


    const str = String(error);
    if (str !== '[object Object]') return str;
    try {
      return JSON.stringify(error);
    } catch {
      return 'Unknown error (see console for details)';
    }
  }

  return 'Internal Rust Error';
}

export const tauriApi = {
  invoke: async <T>(
    command: string,
    args: Record<string, unknown> = {},
  ): Promise<T> => {
    try {
      const response = await invoke<T>(command, args);
      return response;
    } catch (error: unknown) {
      const message = extractError(error);
      console.error(`[Tauri Error] Command ${command} failed:`, message, error);
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
