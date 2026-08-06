import { useState, useCallback } from 'react';
import { connectionService } from '@/services/connection.service';
import { useAppStore } from '@/store/useAppStore';

export type ReconnectStatus = 'idle' | 'connecting' | 'connected' | 'failed';

interface UseAutoReconnectResult {
  status: ReconnectStatus;
  error: string | null;
  reconnect: (connectionId: string) => Promise<boolean>;
}

export function useAutoReconnect(): UseAutoReconnectResult {
  const [status, setStatus] = useState<ReconnectStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const connectedConnectionIds = useAppStore((s) => s.connectedConnectionIds);
  const setConnectedConnection = useAppStore((s) => s.setConnectedConnection);

  const reconnect = useCallback(
    async (connectionId: string): Promise<boolean> => {
      if (connectedConnectionIds.includes(connectionId)) {
        setStatus('connected');
        return true;
      }

      setStatus('connecting');
      setError(null);

      try {
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Connection timeout')), 5000)
        );

        const reconnectPromise = connectionService.reconnect(connectionId);
        await Promise.race([reconnectPromise, timeoutPromise]);

        setConnectedConnection(connectionId);
        setStatus('connected');
        return true;
      } catch (e) {
        setError(String(e));
        setStatus('failed');
        return false;
      }
    },
    [connectedConnectionIds, setConnectedConnection]
  );

  return { status, error, reconnect };
}
