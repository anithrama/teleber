import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { purchaseOrderApi, type PurchaseOrder } from '../api/purchaseOrderApi'
import { DataTable, PageHeading, type Column } from '../components/Primitives'
import { ErrorState, LoadingState } from '../components/LoadingState'
import { StatusBadge } from '../components/StatusBadge'
import { formatDate, formatMoney } from '../utils/format'

export function ApprovalsPage() {
  const navigate = useNavigate()
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    purchaseOrderApi.list().then((rows) => setOrders(rows.filter((row) => row.status === 'PENDING_APPROVAL')))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Approvals are unavailable.'))
      .finally(() => setLoading(false))
  }, [])
  const columns: Column<PurchaseOrder>[] = [
    { key: 'po_number', title: 'Purchase order', sortable: true },
    { key: 'supplier', title: 'Supplier ID' }, { key: 'order_date', title: 'Order date', render: (row) => formatDate(row.order_date) },
    { key: 'expected_delivery_date', title: 'Expected delivery', render: (row) => formatDate(row.expected_delivery_date) },
    { key: 'grand_total', title: 'Total', render: (row) => formatMoney(row.grand_total, row.currency) },
    { key: 'status', title: 'Status', render: (row) => <StatusBadge status={row.status} /> },
  ]
  return <><PageHeading title="Purchase approvals" subtitle="Purchase orders waiting for a manager decision." />{loading ? <LoadingState /> : error ? <ErrorState message={error} /> : <DataTable rows={orders} columns={columns} rowKey={(row) => row.id} onRowClick={(row) => navigate(`/purchase-orders/${row.id}`)} emptyTitle="No pending approvals" emptyText="Submitted purchase orders will appear here." />}</>
}