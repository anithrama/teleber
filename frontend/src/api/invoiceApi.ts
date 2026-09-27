import { api, getAll, unwrap } from './client'

export type InvoiceLine = { id?: number; item: number; quantity: string; rate: string; tax_rate: string; amount?: string }
export type PurchaseInvoice = {
  id: number; invoice_number: string; supplier: number; purchase_order: number; invoice_date: string
  due_date: string; subtotal: string; tax_amount: string; grand_total: string; paid_amount: string
  outstanding_amount: string; status: string; items: InvoiceLine[]
}
export type MatchDetail = {
  item_id: number; item_code: string; purchase_order_quantity: string | null; received_quantity: string
  invoice_quantity: string; purchase_order_rate: string | null; invoice_rates: string[]
}
export type MatchResult = { invoice_id: number; invoice_number: string; result: string; purchase_order: string; details: MatchDetail[] }

const path = 'invoices/'
export const invoiceApi = {
  list: () => getAll<PurchaseInvoice>(path),
  get: async (id: string | number) => unwrap<PurchaseInvoice>(await api.get(`${path}${id}/`)),
  create: async (data: Partial<PurchaseInvoice>) => unwrap<PurchaseInvoice>(await api.post(path, data)),
  update: async (id: string | number, data: Partial<PurchaseInvoice>) => unwrap<PurchaseInvoice>(await api.patch(`${path}${id}/`, data)),
  remove: (id: string | number) => api.delete(`${path}${id}/`),
  match: async (id: number) => unwrap<MatchResult>(await api.post(`${path}${id}/three-way-match/`, {})),
  payment: async (id: number, amount: string) => unwrap<PurchaseInvoice>(await api.post(`${path}${id}/payment/`, { amount })),
}