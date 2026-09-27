import { api, getAll, unwrap } from './client'

export type Supplier = {
  id: number; supplier_code: string; name: string; email: string; phone: string
  address: string; city: string; state: string; country: string; tax_number: string
  payment_terms: string; status: 'ACTIVE' | 'INACTIVE'
}

const path = 'suppliers/'
export const supplierApi = {
  list: () => getAll<Supplier>(path),
  get: async (id: string | number) => unwrap<Supplier>(await api.get(`${path}${id}/`)),
  create: async (data: Partial<Supplier>) => unwrap<Supplier>(await api.post(path, data)),
  update: async (id: string | number, data: Partial<Supplier>) => unwrap<Supplier>(await api.patch(`${path}${id}/`, data)),
  remove: (id: string | number) => api.delete(`${path}${id}/`),
}