import { api, getAll, unwrap } from './client'

export type PurchaseOrderLine = {
  id: number; item: number; quantity: string; received_quantity: string; rate: string
  tax_rate: string; discount: string; amount: string
}
export type PurchaseOrder = {
  id: number; po_number: string; supplier: number; material_request: number; quotation: number | null
  order_date: string; expected_delivery_date: string; currency: string; status: string
  subtotal: string; tax_amount: string; discount_amount: string; grand_total: string
  remarks: string; created_by: number; approved_by: number | null; approved_at: string | null
  rejected_by: number | null; rejected_at: string | null; rejection_reason: string; items: PurchaseOrderLine[]
}

export type PurchaseOrderInput = Omit<Partial<PurchaseOrder>, 'items'> & {
  items?: { item: number; quantity: string; rate: string; tax_rate: string; discount?: string }[]
}

const path = 'purchase-orders/'
export const purchaseOrderApi = {
  list: () => getAll<PurchaseOrder>(path),
  get: async (id: string | number) => unwrap<PurchaseOrder>(await api.get(`${path}${id}/`)),
  create: async (data: PurchaseOrderInput) => unwrap<PurchaseOrder>(await api.post(path, data)),
  update: async (id: string | number, data: PurchaseOrderInput) => unwrap<PurchaseOrder>(await api.patch(`${path}${id}/`, data)),
  remove: (id: string | number) => api.delete(`${path}${id}/`),
  action: async (id: number, action: 'submit' | 'approve' | 'reject' | 'mark-ordered' | 'cancel', data?: { reason?: string }) =>
    unwrap<PurchaseOrder>(await api.post(`${path}${id}/${action}/`, data || {})),
}