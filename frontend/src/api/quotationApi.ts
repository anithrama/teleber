import { api, getAll, unwrap } from './client'

export type QuotationLine = { id?: number; item: number; quantity: string; rate: string; tax_rate: string; amount?: string }
export type Quotation = {
  id: number; quotation_number: string; supplier: number; material_request: number
  quotation_date: string; valid_until: string; status: string; remarks: string; total_amount: string; items: QuotationLine[]
}
export type ComparisonLine = {
  supplier: string; supplier_id: number; quotation_number: string; item: string; item_code: string
  quantity: string; rate: string; tax_rate: string; tax: string; subtotal: string; grand_total: string; valid_until: string
}

const path = 'quotations/'
export const quotationApi = {
  list: () => getAll<Quotation>(path),
  get: async (id: string | number) => unwrap<Quotation>(await api.get(`${path}${id}/`)),
  create: async (data: Partial<Quotation>) => unwrap<Quotation>(await api.post(path, data)),
  update: async (id: string | number, data: Partial<Quotation>) => unwrap<Quotation>(await api.patch(`${path}${id}/`, data)),
  remove: (id: string | number) => api.delete(`${path}${id}/`),
  compare: async (requestId: number) => unwrap<ComparisonLine[]>(await api.get(`${path}compare/`, { params: { material_request: requestId } })),
}