import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { schemaService } from '@/services/schema.service'
import { useAppStore } from '@/store/useAppStore'

export function useSchemas() {
  const { activeConnection, setActiveConnectionDatabase } = useAppStore()
  const queryClient = useQueryClient()

  const { data: schemas, isLoading } = useQuery({
    queryKey: ['schemas', activeConnection?.id],
    queryFn: () => schemaService.getSchemas(activeConnection!.id),
    enabled: !!activeConnection,
    staleTime: 5 * 60 * 1000,
  })

  const switchSchema = useMutation({
    mutationFn: (schema: string) => schemaService.switchSchema(activeConnection!.id, schema),
    onSuccess: (_, schema) => {
      setActiveConnectionDatabase(schema)
      queryClient.invalidateQueries({ 
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
