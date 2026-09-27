import { invoiceApi } from './invoiceApi'
import { itemApi } from './itemApi'
import { materialRequestApi } from './materialRequestApi'
import { purchaseOrderApi } from './purchaseOrderApi'
import { receiptApi } from './receiptApi'
import { supplierApi } from './supplierApi'
import type { UserRole } from './authApi'

export async function loadDashboard(role: UserRole) {
  const [suppliers, items, requests, orders, receipts] = await Promise.all([
    supplierApi.list(), itemApi.list(), materialRequestApi.list(), purchaseOrderApi.list(), receiptApi.list(),
  ])
  const canReadInvoices = ['ADMIN', 'PURCHASE_MANAGER', 'ACCOUNTS_USER', 'VIEWER'].includes(role)
  const invoices = canReadInvoices ? await invoiceApi.list() : null
  const pendingOrderStatuses = new Set(['APPROVED', 'ORDERED', 'PARTIALLY_RECEIVED'])
  const purchasableOrders = orders.filter((order) => ['APPROVED', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED'].includes(order.status))
  const pendingReceiptIds = new Set(orders.filter((order) => pendingOrderStatuses.has(order.status)).map((order) => order.id))

  return {
    totalSuppliers: suppliers.length,
    totalItems: items.length,
    pendingRequests: requests.filter((request) => request.status === 'SUBMITTED').length,
    pendingApprovals: orders.filter((order) => order.status === 'PENDING_APPROVAL').length,
    purchaseOrders: orders.length,
    pendingReceipts: pendingReceiptIds.size,
    unpaidInvoices: invoices?.filter((invoice) => !['PAID', 'MATCHED'].includes(invoice.status)).length ?? null,
    purchaseValue: purchasableOrders.reduce((sum, order) => sum + Number(order.grand_total || 0), 0),
    lowStockItems: items.filter((item) => Number(item.current_stock) <= Number(item.minimum_stock)).length,
    recentOrders: orders.slice(0, 5),
    recentReceipts: receipts.slice(0, 5),
  }
}