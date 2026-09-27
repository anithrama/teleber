import { api, getAll, unwrap } from './client'

export type ReceiptLine = { id?: number; purchase_order_item: number; ordered_quantity: string; received_quantity: string; rejected_quantity: string; accepted_quantity?: string }
export type PurchaseReceipt = { id: number; receipt_number: string; purchase_order: number; warehouse: number; receipt_date: string; received_by: number; status: string; items: ReceiptLine[] }
export type PurchaseReceiptInput = {
  receipt_number: string; purchase_order: number; warehouse: number; receipt_date: string
  items: { purchase_order_item: number; received_quantity: string; rejected_quantity: string }[]
}
export type Warehouse = { id: number; code: string; name: string; is_active: boolean }
export type StockMovement = { id: number; item: number; warehouse: number; transaction_type: string; reference_type: string; reference_id: string; quantity: string; balance_quantity: string; transaction_date: string }

export const receiptApi = {
  list: () => getAll<PurchaseReceipt>('purchase-receipts/'),
  get: async (id: string | number) => unwrap<PurchaseReceipt>(await api.get(`purchase-receipts/${id}/`)),
  create: async (data: PurchaseReceiptInput) => unwrap<PurchaseReceipt>(await api.post('purchase-receipts/', data)),
  warehouses: () => getAll<Warehouse>('warehouses/'),
  movements: () => getAll<StockMovement>('stock-movements/'),
}