import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import { useAppStore } from '@/store/useAppStore'

export function useSchemas() {
  const { activeConnection, setActiveConnectionDatabase } = useAppStore()
  const queryClient = useQueryClient()

  const { data: schemas, isLoading } = useQuery({
    queryKey: ['schemas', activeConnection?.id],
    queryFn: () => apiFetch<string[]>(`/connections/${activeConnection?.id}/schema/schemas`),
    enabled: !!activeConnection,
  })

  const switchSchema = useMutation({
    mutationFn: (schema: string) => apiFetch(`/connections/${activeConnection?.id}/schema/switch-schema`, {
      method: 'POST',
      body: JSON.stringify({ schema })
    }),
    onSuccess: async (_, schema) => {
      setActiveConnectionDatabase(schema)
      await queryClient.invalidateQueries({ 
        predicate: (query) => query.queryKey.includes(activeConnection?.id)
      })
    }
  })

  return {
    schemas: schemas || [],
    isLoading,
    currentSchema: activeConnection?.database || '',
    switchSchema: switchSchema.mutate,
    isSwitching: switchSchema.isPending
  }
}
