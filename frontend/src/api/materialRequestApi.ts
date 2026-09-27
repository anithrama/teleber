import { api, getAll, unwrap } from './client'
import type { Item } from './itemApi'

export type RequestLine = { id?: number; item: number; quantity: string; estimated_rate: string; remarks?: string; item_detail?: Item }
export type MaterialRequest = {
  id: number; request_number: string; requested_by: number; requested_by_name?: string; department: string
  request_date: string; required_date: string; priority: string; status: string; remarks: string; items: RequestLine[]
}

const path = 'material-requests/'
export const materialRequestApi = {
  list: () => getAll<MaterialRequest>(path),
  get: async (id: string | number) => unwrap<MaterialRequest>(await api.get(`${path}${id}/`)),
  create: async (data: Partial<MaterialRequest>) => unwrap<MaterialRequest>(await api.post(path, data)),
  update: async (id: string | number, data: Partial<MaterialRequest>) => unwrap<MaterialRequest>(await api.patch(`${path}${id}/`, data)),
  remove: (id: string | number) => api.delete(`${path}${id}/`),
  action: async (id: number, action: 'submit' | 'approve' | 'reject' | 'cancel', data?: { reason?: string }) =>
    unwrap<MaterialRequest>(await api.post(`${path}${id}/${action}/`, data || {})),
}