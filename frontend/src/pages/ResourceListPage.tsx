import { useEffect, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { Column } from '../components/Primitives'
import { Button, DataTable, PageHeading, SelectInput } from '../components/Primitives'
import { ErrorState, LoadingState } from '../components/LoadingState'
import { StatusBadge } from '../components/StatusBadge'
import { useAuth } from '../context/AuthContext'
import { itemApi } from '../api/itemApi'
import { supplierApi, type Supplier } from '../api/supplierApi'
import { materialRequestApi } from '../api/materialRequestApi'
import { quotationApi } from '../api/quotationApi'
import { purchaseOrderApi } from '../api/purchaseOrderApi'
import { receiptApi } from '../api/receiptApi'
import { invoiceApi } from '../api/invoiceApi'
import { formatDate, formatMoney, formatNumber } from '../utils/format'
import type { UserRole } from '../api/authApi'

export type ResourceKind = 'suppliers' | 'items' | 'material-requests' | 'quotations' | 'purchase-orders' | 'purchase-receipts' | 'invoices'
type Row = Record<string, unknown> & { id: number; status?: string }

const resourceInfo: Record<ResourceKind, { title: string; subtitle: string; createLabel: string; createRoles: UserRole[] }> = {
  suppliers: { title: 'Suppliers', subtitle: 'Manage supplier records and commercial terms.', createLabel: 'Add supplier', createRoles: ['ADMIN', 'PURCHASE_MANAGER', 'PURCHASE_USER'] },
  items: { title: 'Items', subtitle: 'Catalogue, rates, tax, and on-hand stock from inventory.', createLabel: 'Add item', createRoles: ['ADMIN', 'PURCHASE_MANAGER', 'PURCHASE_USER'] },
  'material-requests': { title: 'Material requests', subtitle: 'Track internal demand from draft through approval.', createLabel: 'New request', createRoles: ['ADMIN', 'PURCHASE_MANAGER', 'PURCHASE_USER'] },
  quotations: { title: 'Supplier quotations', subtitle: 'Review offers submitted against material requests.', createLabel: 'New quotation', createRoles: ['ADMIN', 'PURCHASE_MANAGER', 'PURCHASE_USER'] },
  'purchase-orders': { title: 'Purchase orders', subtitle: 'Orders, approval state, and supplier commitments.', createLabel: 'New purchase order', createRoles: ['ADMIN', 'PURCHASE_MANAGER', 'PURCHASE_USER'] },
  'purchase-receipts': { title: 'Purchase receipts', subtitle: 'Posted receipts and accepted quantities from receiving.', createLabel: 'Record receipt', createRoles: ['ADMIN', 'WAREHOUSE_MANAGER'] },
  invoices: { title: 'Purchase invoices', subtitle: 'Supplier invoices, outstanding balances, and match results.', createLabel: 'New invoice', createRoles: ['ADMIN', 'ACCOUNTS_USER'] },
}

function loadRows(kind: ResourceKind): Promise<unknown[]> {
  switch (kind) {
    case 'suppliers': return supplierApi.list()
    case 'items': return itemApi.list()
    case 'material-requests': return materialRequestApi.list()
    case 'quotations': return quotationApi.list()
    case 'purchase-orders': return purchaseOrderApi.list()
    case 'purchase-receipts': return receiptApi.list()
    case 'invoices': return invoiceApi.list()
  }
}

function columnsFor(kind: ResourceKind): Column<Row>[] {
  const primary = (value: unknown, secondary?: unknown) => <><span className="cell-primary">{String(value || '—')}</span>{secondary && <span className="cell-secondary">{String(secondary)}</span>}</>
  const status = (row: Row) => <StatusBadge status={row.status} />
  switch (kind) {
    case 'suppliers': return [
      { key: 'supplier_code', title: 'Supplier', sortable: true, render: (row) => primary(row.supplier_code, row.name) },
      { key: 'email', title: 'Email' }, { key: 'city', title: 'City' }, { key: 'country', title: 'Country' },
      { key: 'status', title: 'Status', render: status },
    ]
    case 'items': return [
      { key: 'item_code', title: 'Item', sortable: true, render: (row) => primary(row.item_code, row.name) },
      { key: 'category', title: 'Category' }, { key: 'unit', title: 'Unit' },
      { key: 'purchase_rate', title: 'Purchase rate', render: (row) => formatMoney(String(row.purchase_rate)) },
      { key: 'current_stock', title: 'On hand', render: (row) => `${formatNumber(String(row.current_stock))} ${String(row.unit || '')}` },
      { key: 'is_active', title: 'Status', render: (row) => <StatusBadge status={row.is_active ? 'ACTIVE' : 'INACTIVE'} /> },
    ]
    case 'material-requests': return [
      { key: 'request_number', title: 'Request', sortable: true, render: (row) => primary(row.request_number, row.department) },
      { key: 'requested_by_name', title: 'Requested by' }, { key: 'request_date', title: 'Requested', render: (row) => formatDate(String(row.request_date)) },
      { key: 'required_date', title: 'Required by', render: (row) => formatDate(String(row.required_date)) }, { key: 'priority', title: 'Priority' },
      { key: 'status', title: 'Status', render: status },
    ]
    case 'quotations': return [
      { key: 'quotation_number', title: 'Quotation', sortable: true, render: (row) => primary(row.quotation_number, `Supplier #${row.supplier}`) },
      { key: 'material_request', title: 'Request' }, { key: 'quotation_date', title: 'Date', render: (row) => formatDate(String(row.quotation_date)) },
      { key: 'valid_until', title: 'Valid until', render: (row) => formatDate(String(row.valid_until)) },
      { key: 'total_amount', title: 'Total', render: (row) => formatMoney(String(row.total_amount)) }, { key: 'status', title: 'Status', render: status },
    ]
    case 'purchase-orders': return [
      { key: 'po_number', title: 'Purchase order', sortable: true, render: (row) => primary(row.po_number, `Supplier #${row.supplier}`) },
      { key: 'order_date', title: 'Order date', render: (row) => formatDate(String(row.order_date)) },
      { key: 'expected_delivery_date', title: 'Expected', render: (row) => formatDate(String(row.expected_delivery_date)) },
      { key: 'grand_total', title: 'Total', render: (row) => formatMoney(String(row.grand_total), String(row.currency || 'USD')) },
      { key: 'status', title: 'Status', render: status },
    ]
    case 'purchase-receipts': return [
      { key: 'receipt_number', title: 'Receipt', sortable: true, render: (row) => primary(row.receipt_number, `PO #${row.purchase_order}`) },
      { key: 'warehouse', title: 'Warehouse' }, { key: 'receipt_date', title: 'Receipt date', render: (row) => formatDate(String(row.receipt_date)) },
      { key: 'received_by', title: 'Received by' }, { key: 'status', title: 'Status', render: status },
    ]
    case 'invoices': return [
      { key: 'invoice_number', title: 'Invoice', sortable: true, render: (row) => primary(row.invoice_number, `PO #${row.purchase_order}`) },
      { key: 'invoice_date', title: 'Invoice date', render: (row) => formatDate(String(row.invoice_date)) },
      { key: 'due_date', title: 'Due date', render: (row) => formatDate(String(row.due_date)) },
      { key: 'grand_total', title: 'Total', render: (row) => formatMoney(String(row.grand_total)) },
      { key: 'outstanding_amount', title: 'Outstanding', render: (row) => formatMoney(String(row.outstanding_amount)) },
      { key: 'status', title: 'Status', render: status },
    ]
  }
}

export function ResourceListPage({ kind }: { kind: ResourceKind }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [rows, setRows] = useState<Row[]>([])
  const [supplierNames, setSupplierNames] = useState<Map<number, string>>(new Map())
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [priority, setPriority] = useState('all')
  const [supplierFilter, setSupplierFilter] = useState('all')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const info = resourceInfo[kind]
  const canCreate = info.createRoles.includes(user?.role || 'VIEWER')

  async function refresh() {
    setLoading(true)
    setError('')
    try {
      const [records, suppliers] = await Promise.all([
        loadRows(kind),
        ['quotations', 'purchase-orders', 'invoices'].includes(kind) ? supplierApi.list() : Promise.resolve([]),
      ])
      setRows(records as Row[])
      if (['quotations', 'purchase-orders', 'invoices'].includes(kind)) {
        setSuppliers(suppliers)
        setSupplierNames(new Map(suppliers.map((supplier) => [supplier.id, supplier.name])))
      }
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load records.') }
    finally { setLoading(false) }
  }

  useEffect(() => { void refresh() }, [kind])

  const visibleRows = useMemo(
    () => rows.filter((row) => {
      const matchesPriority = kind !== 'material-requests' || priority === 'all' || row.priority === priority
      const matchesSupplier = kind !== 'quotations' || supplierFilter === 'all' || String(row.supplier) === supplierFilter
      return matchesPriority && matchesSupplier
    }),
    [kind, priority, rows, supplierFilter],
  )
  const tableColumns = useMemo(() => {
    const columns = columnsFor(kind)
    if (['quotations', 'purchase-orders', 'invoices'].includes(kind)) {
      const primaryKey = kind === 'quotations' ? 'quotation_number' : kind === 'purchase-orders' ? 'po_number' : 'invoice_number'
      return columns.map((column) => column.key === primaryKey
        ? { ...column, render: (row: Row) => <><span className="cell-primary">{String(row[primaryKey] || '—')}</span><span className="cell-secondary">{supplierNames.get(Number(row.supplier)) || `Supplier #${row.supplier}`}</span></> }
        : column)
    }
    if (kind === 'material-requests') {
      return columns.map((column) => column.key === 'requested_by_name'
        ? { ...column, render: (row: Row) => String(row.requested_by_name || `User #${row.requested_by}`) }
        : column)
    }
    return columns
  }, [kind, supplierNames])
  const priorityFilter = kind === 'material-requests' ? <label className="filter-control"><span>Priority</span><SelectInput aria-label="Filter by priority" value={priority} onChange={(event) => setPriority(event.target.value)}><option value="all">All priorities</option>{['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((value) => <option key={value} value={value}>{value}</option>)}</SelectInput></label> : undefined
  const supplierSelect = kind === 'quotations' ? <label className="filter-control"><span>Supplier</span><SelectInput aria-label="Filter by supplier" value={supplierFilter} onChange={(event) => setSupplierFilter(event.target.value)}><option value="all">All suppliers</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</SelectInput></label> : undefined

  return <>
    <PageHeading title={info.title} subtitle={info.subtitle} action={canCreate ? <Button onClick={() => navigate(`/${kind}/create`)}><Plus size={16} />{info.createLabel}</Button> : undefined} />
    {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={() => void refresh()} /> : <DataTable rows={visibleRows} columns={tableColumns} rowKey={(row) => row.id} onRowClick={(row) => navigate(`/${kind}/${row.id}`)} onRefresh={() => void refresh()} extraFilter={priorityFilter || supplierSelect} />}
  </>
}