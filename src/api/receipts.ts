import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { del, get } from './client'
import type { Page, Receipt, ReceiptListParams } from './types'

export const receiptKeys = {
  list: (p: ReceiptListParams) => ['receipts', 'list', p] as const,
  detail: (id: number) => ['receipts', 'detail', id] as const,
}

export function useReceipts(params: ReceiptListParams) {
  return useQuery({
    queryKey: receiptKeys.list(params),
    queryFn: () => get<Page<Receipt>>('/api/receipts/list/', params as Record<string, unknown>),
    placeholderData: keepPreviousData,
  })
}

export function useReceipt(id: number) {
  return useQuery({
    queryKey: receiptKeys.detail(id),
    queryFn: () => get<Receipt>(`/api/receipts/${id}/`),
  })
}

export function useDeleteReceipt(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => del(`/api/receipts/${id}/`),
    onSuccess: () => {
      qc.removeQueries({ queryKey: receiptKeys.detail(id) })
      qc.invalidateQueries({ queryKey: ['receipts', 'list'] })
      qc.invalidateQueries({ queryKey: ['reconcile'] })
    },
  })
}
