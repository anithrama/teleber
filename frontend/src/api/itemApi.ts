import { api, getAll, unwrap } from './client'

export type Item = {
  id: number; item_code: string; name: string; description: string; category: string; unit: string
  purchase_rate: string; tax_rate: string; minimum_stock: string; current_stock: string; is_active: boolean
}

const path = 'items/'
export const itemApi = {
  list: () => getAll<Item>(path),
  get: async (id: string | number) => unwrap<Item>(await api.get(`${path}${id}/`)),
  create: async (data: Partial<Item>) => unwrap<Item>(await api.post(path, data)),
  update: async (id: string | number, data: Partial<Item>) => unwrap<Item>(await api.patch(`${path}${id}/`, data)),
  remove: (id: string | number) => api.delete(`${path}${id}/`),
}