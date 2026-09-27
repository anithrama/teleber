import { useEffect, useState } from 'react'
import { AlertTriangle, Boxes, ClipboardList, FileCheck2, FileText, PackageCheck, ReceiptText, TrendingUp, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { loadDashboard } from '../api/dashboardApi'
import type { UserRole } from '../api/authApi'
import type { PurchaseOrder } from '../api/purchaseOrderApi'
import type { PurchaseReceipt } from '../api/receiptApi'
import { ErrorState, LoadingState } from '../components/LoadingState'
import { PageHeading } from '../components/Primitives'
import { StatusBadge } from '../components/StatusBadge'
import { useAuth } from '../context/AuthContext'
import { formatDate, formatMoney } from '../utils/format'

type DashboardData = Awaited<ReturnType<typeof loadDashboard>>

const cards = [
  { key: 'totalSuppliers', label: 'Supplier records', icon: Users, format: (value: number | null) => String(value) },
  { key: 'totalItems', label: 'Items in catalogue', icon: Boxes, format: (value: number | null) => String(value) },
  { key: 'pendingRequests', label: 'Requests awaiting approval', icon: ClipboardList, format: (value: number | null) => String(value) },
  { key: 'pendingApprovals', label: 'Purchase approvals', icon: FileCheck2, format: (value: number | null) => String(value) },
  { key: 'purchaseOrders', label: 'Purchase orders', icon: FileText, format: (value: number | null) => String(value) },
  { key: 'pendingReceipts', label: 'Orders awaiting receipt', icon: PackageCheck, format: (value: number | null) => String(value) },
  { key: 'unpaidInvoices', label: 'Unpaid invoices', icon: ReceiptText, format: (value: number | null) => value === null ? '—' : String(value) },
  { key: 'purchaseValue', label: 'Committed purchase value', icon: TrendingUp, format: (value: number | null) => value === null ? '—' : formatMoney(value) },
  { key: 'lowStockItems', label: 'Items at or below minimum', icon: AlertTriangle, format: (value: number | null) => String(value) },
] as const

export function DashboardPage() {
  const { user } = useAuth()
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  async function refresh() {
    if (!user) return
    setLoading(true)
    setError('')
    try { setData(await loadDashboard(user.role as UserRole)) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load dashboard data.') }
    finally { setLoading(false) }
  }

  useEffect(() => { void refresh() }, [user])

  if (loading) return <LoadingState label="Loading live procurement data" />
  if (error || !data) return <ErrorState message={error || 'No dashboard data is available.'} onRetry={() => void refresh()} />

  return <>
    <PageHeading title={`Good ${new Date().getHours() < 12 ? 'morning' : 'afternoon'}, ${user?.first_name || user?.username}`} subtitle="Procurement activity and commitments from your live records." />
    <div className="metric-grid">{cards.map(({ key, label, icon: Icon, format }, index) => <article className={`metric-card ${index === 7 ? 'metric-card--accent' : ''}`} key={key}>
      <span className="metric-card__label">{label}</span><span className="metric-card__icon"><Icon size={16} /></span><div className="metric-card__value">{format(data[key] as number | null)}</div>
    </article>)}</div>
    <div className="dashboard-lower">
      <section className="dashboard-panel"><header className="dashboard-panel__header"><h2>Latest purchase orders</h2><Link to="/purchase-orders">All orders</Link></header><div className="dashboard-panel__body">
        {data.recentOrders.length ? data.recentOrders.map((order: PurchaseOrder) => <Link className="mini-row" to={`/purchase-orders/${order.id}`} key={order.id}><span><strong>{order.po_number}</strong><small>Expected {formatDate(order.expected_delivery_date)}</small></span><span className="mini-row__right"><StatusBadge status={order.status} /><strong>{formatMoney(order.grand_total, order.currency)}</strong></span></Link>) : <div className="empty-state"><strong>No purchase orders yet</strong><span>Orders created through this workspace will appear here.</span></div>}
      </div></section>
      <section className="dashboard-panel"><header className="dashboard-panel__header"><h2>Receiving activity</h2><Link to="/purchase-receipts">Receipts</Link></header><div className="dashboard-panel__body">
        {data.recentReceipts.length ? data.recentReceipts.map((receipt: PurchaseReceipt) => <Link className="mini-row" to={`/purchase-receipts/${receipt.id}`} key={receipt.id}><span><strong>{receipt.receipt_number}</strong><small>{formatDate(receipt.receipt_date)}</small></span><StatusBadge status={receipt.status} /></Link>) : <div className="inventory-alerts"><div className="inventory-alert"><span className="inventory-alert__icon"><PackageCheck size={15} /></span><span><strong>No receipts recorded</strong><small>Posted receipts and accepted quantities appear here.</small></span></div><div className="inventory-alert"><span className="inventory-alert__icon"><AlertTriangle size={15} /></span><span><strong>{data.lowStockItems} low-stock items</strong><small>Based on the item catalogue minimums.</small></span></div></div>}
      </div></section>
    </div>
  </>
}