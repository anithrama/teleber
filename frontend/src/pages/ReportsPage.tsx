import { useEffect, useState } from 'react'
import { ArrowUpRight, BarChart3 } from 'lucide-react'
import { purchaseOrderApi, type PurchaseOrder } from '../api/purchaseOrderApi'
import { supplierApi, type Supplier } from '../api/supplierApi'
import { ErrorState, LoadingState } from '../components/LoadingState'
import { PageHeading } from '../components/Primitives'
import { formatMoney } from '../utils/format'

export function ReportsPage() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([purchaseOrderApi.list(), supplierApi.list()]).then(([orderRows, supplierRows]) => {
      setOrders(orderRows); setSuppliers(supplierRows)
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Reports are unavailable.'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingState label="Loading procurement records" />
  if (error) return <ErrorState message={error} />
  const counted = orders.filter((order) => ['APPROVED', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED'].includes(order.status))
  const totals = suppliers.map((supplier) => ({
    supplier,
    count: counted.filter((order) => order.supplier === supplier.id).length,
    value: counted.filter((order) => order.supplier === supplier.id).reduce((sum, order) => sum + Number(order.grand_total), 0),
  })).filter((row) => row.count > 0).sort((a, b) => b.value - a.value)
  const committed = counted.reduce((sum, order) => sum + Number(order.grand_total), 0)

  return <>
    <PageHeading title="Procurement reports" subtitle="Committed PO value grouped by supplier using current backend records." />
    <div className="report-summary"><div><span>Committed purchase value</span><strong>{formatMoney(committed)}</strong><small>{counted.length} approved, ordered, or received orders</small></div><div className="report-summary__icon"><BarChart3 size={20} /></div></div>
    <section className="table-panel report-table"><div className="dashboard-panel__header"><h2>Supplier commitments</h2><span>{totals.length} suppliers</span></div>
      {totals.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Supplier</th><th>Orders</th><th>Committed value</th><th>Share</th></tr></thead><tbody>{totals.map(({ supplier, count, value }) => <tr key={supplier.id}><td><span className="cell-primary">{supplier.name}</span><span className="cell-secondary">{supplier.supplier_code}</span></td><td>{count}</td><td>{formatMoney(value)}</td><td><span className="report-share">{committed ? Math.round(value / committed * 100) : 0}%<ArrowUpRight size={13} /></span></td></tr>)}</tbody></table></div> : <div className="empty-state"><strong>No committed orders</strong><span>Approved, ordered, partially received, or received POs will be summarized here.</span></div>}
    </section>
  </>
}