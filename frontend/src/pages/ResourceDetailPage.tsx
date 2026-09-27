import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Check, Pencil, X, RefreshCw, CreditCard, LoaderCircle, Trash2 } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { itemApi, type Item } from '../api/itemApi'
import { materialRequestApi } from '../api/materialRequestApi'
import { purchaseOrderApi, type PurchaseOrder } from '../api/purchaseOrderApi'
import { quotationApi } from '../api/quotationApi'
import { receiptApi } from '../api/receiptApi'
import { invoiceApi, type MatchResult } from '../api/invoiceApi'
import { supplierApi } from '../api/supplierApi'
import { ApiError, apiErrorMessage } from '../api/client'
import { Button, FormField, PageHeading, TextInput } from '../components/Primitives'
import { ErrorState, LoadingState } from '../components/LoadingState'
import { Modal } from '../components/Modal'
import { StatusBadge } from '../components/StatusBadge'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { displayName, formatDate, formatMoney, formatNumber } from '../utils/format'
import type { ResourceKind } from './ResourceListPage'

type RecordValue = Record<string, any> & { id: number; status?: string }
type LookupData = { suppliers: any[]; items: Item[]; requests: any[]; quotations: any[]; orders: PurchaseOrder[]; receipts: any[]; warehouses: any[] }

async function getRecord(kind: ResourceKind, id: string) {
  switch (kind) {
    case 'suppliers': return supplierApi.get(id)
    case 'items': return itemApi.get(id)
    case 'material-requests': return materialRequestApi.get(id)
    case 'quotations': return quotationApi.get(id)
    case 'purchase-orders': return purchaseOrderApi.get(id)
    case 'purchase-receipts': return receiptApi.get(id)
    case 'invoices': return invoiceApi.get(id)
  }
}

async function getLookups(kind: ResourceKind): Promise<LookupData> {
  const lookup: LookupData = { suppliers: [], items: [], requests: [], quotations: [], orders: [], receipts: [], warehouses: [] }
  const requests: Promise<unknown>[] = []
  const keys: (keyof LookupData)[] = []
  if (['quotations', 'purchase-orders', 'purchase-receipts', 'invoices'].includes(kind)) { requests.push(supplierApi.list()); keys.push('suppliers') }
  if (['material-requests', 'quotations', 'purchase-orders', 'purchase-receipts', 'invoices'].includes(kind)) { requests.push(itemApi.list()); keys.push('items') }
  if (['quotations', 'purchase-orders'].includes(kind)) { requests.push(materialRequestApi.list()); keys.push('requests') }
  if (kind === 'purchase-orders') { requests.push(quotationApi.list()); keys.push('quotations') }
  if (['purchase-receipts', 'invoices'].includes(kind)) { requests.push(purchaseOrderApi.list()); keys.push('orders') }
  if (kind === 'purchase-receipts') {
    requests.push(receiptApi.warehouses()); keys.push('warehouses')
    requests.push(receiptApi.list()); keys.push('receipts')
  }
  if (kind === 'invoices') { requests.push(receiptApi.list()); keys.push('receipts') }
  const values = await Promise.all(requests)
  values.forEach((value, index) => { lookup[keys[index]] = value as never })
  return lookup
}

export function ResourceDetailPage({ kind }: { kind: ResourceKind }) {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { notify } = useToast()
  const [record, setRecord] = useState<RecordValue | null>(null)
  const [lookups, setLookups] = useState<LookupData>({ suppliers: [], items: [], requests: [], quotations: [], orders: [], receipts: [], warehouses: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pendingAction, setPendingAction] = useState('')
  const [busy, setBusy] = useState(false)
  const [reason, setReason] = useState('')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [match, setMatch] = useState<MatchResult | null>(null)

  async function refresh() {
    setLoading(true)
    setError('')
    try {
      const [current, referenceData] = await Promise.all([getRecord(kind, id), getLookups(kind)])
      setRecord(current as unknown as RecordValue)
      setLookups(referenceData)
    } catch (failure) { setError(apiErrorMessage(failure)) }
    finally { setLoading(false) }
  }

  useEffect(() => { void refresh() }, [kind, id])

  const itemMap = useMemo(() => new Map(lookups.items.map((item) => [item.id, item])), [lookups.items])
  const supplierMap = useMemo(() => new Map(lookups.suppliers.map((supplier) => [supplier.id, supplier])), [lookups.suppliers])
  const order = ['invoices', 'purchase-receipts'].includes(kind)
    ? lookups.orders.find((candidate) => candidate.id === record?.purchase_order)
    : undefined
  const receiptsForOrder = lookups.receipts.filter((receipt) => receipt.purchase_order === (order?.id || record?.purchase_order))
  const canManagePurchase = ['ADMIN', 'PURCHASE_MANAGER'].includes(user?.role || '')
  const isBuyer = ['ADMIN', 'PURCHASE_MANAGER', 'PURCHASE_USER'].includes(user?.role || '')
  const recordStatus = record?.status || ''
  const isDraft = recordStatus === 'DRAFT'

  function beginAction(action: string) {
    setPendingAction(action)
    setReason('')
  }

  async function confirmAction() {
    if (!record) return
    if (pendingAction === 'reject' && !reason.trim()) { notify('Enter a rejection reason.', 'error'); return }
    setBusy(true)
    try {
      if (pendingAction === 'delete') {
        if (kind === 'suppliers') await supplierApi.remove(record.id)
        else if (kind === 'items') await itemApi.remove(record.id)
        else if (kind === 'material-requests') await materialRequestApi.remove(record.id)
        else if (kind === 'quotations') await quotationApi.remove(record.id)
        else if (kind === 'purchase-orders') await purchaseOrderApi.remove(record.id)
        else if (kind === 'invoices') await invoiceApi.remove(record.id)
        notify(`${record.request_number || record.po_number || record.quotation_number || record.invoice_number || record.supplier_code || record.item_code} deleted.`)
        navigate(`/${kind}`)
        return
      }
      if (kind === 'material-requests') await materialRequestApi.action(record.id, pendingAction as 'submit' | 'approve' | 'reject' | 'cancel', pendingAction === 'reject' ? { reason } : undefined)
      else if (kind === 'purchase-orders') await purchaseOrderApi.action(record.id, pendingAction as 'submit' | 'approve' | 'reject' | 'mark-ordered' | 'cancel', pendingAction === 'reject' ? { reason } : undefined)
      else return
      notify(`${pendingAction.replaceAll('-', ' ')} completed.`)
      setPendingAction('')
      await refresh()
    } catch (failure) {
      const status = failure instanceof ApiError ? failure.status : undefined
      notify(status === 403 ? 'Your role is not allowed to perform this action.' : apiErrorMessage(failure), 'error')
    } finally { setBusy(false) }
  }

  async function runMatch() {
    if (!record) return
    setBusy(true)
    try {
      const result = await invoiceApi.match(record.id)
      setMatch(result)
      notify('Three-way match completed.')
      await refresh()
    } catch (failure) {
      const status = failure instanceof ApiError ? failure.status : undefined
      notify(status === 403 ? 'Your role cannot run invoice matching.' : apiErrorMessage(failure), 'error')
    } finally { setBusy(false) }
  }

  async function postPayment() {
    if (!record) return
    setBusy(true)
    try {
      await invoiceApi.payment(record.id, paymentAmount)
      notify('Payment recorded.')
      setPendingAction('')
      setPaymentAmount('')
      await refresh()
    } catch (failure) {
      notify(failure instanceof ApiError && failure.status === 403 ? 'Your role cannot post payments.' : apiErrorMessage(failure), 'error')
    } finally { setBusy(false) }
  }

  if (loading) return <LoadingState label="Loading record and related API data" />
  if (error || !record) return <ErrorState message={error || 'This record was not found.'} onRetry={() => void refresh()} />

  const supplier = supplierMap.get(record.supplier)
  const request = lookups.requests.find((row) => row.id === record.material_request)
  const quotation = lookups.quotations.find((row) => row.id === record.quotation)
  const warehouse = lookups.warehouses.find((row) => row.id === record.warehouse)
  const lines: RecordValue[] = Array.isArray(record.items) ? record.items : []
  const title = kind === 'suppliers' ? `${record.supplier_code} · ${record.name}`
    : kind === 'items' ? `${record.item_code} · ${record.name}`
    : record.request_number || record.quotation_number || record.po_number || record.receipt_number || record.invoice_number || 'Record details'

  const fieldRows: [string, string][] = kind === 'suppliers' ? [
    ['Supplier code', record.supplier_code], ['Name', record.name], ['Email', record.email], ['Phone', record.phone],
    ['Address', record.address], ['City', record.city], ['State', record.state], ['Country', record.country],
    ['Tax number', record.tax_number], ['Payment terms', record.payment_terms],
  ] : kind === 'items' ? [
    ['Item code', record.item_code], ['Name', record.name], ['Category', record.category], ['Unit', record.unit],
    ['Purchase rate', formatMoney(record.purchase_rate)], ['Tax rate', `${formatNumber(record.tax_rate, 2)}%`],
    ['Minimum stock', formatNumber(record.minimum_stock)], ['Current stock', formatNumber(record.current_stock)],
    ['Active', record.is_active ? 'Yes' : 'No'], ['Description', record.description],
  ] : kind === 'material-requests' ? [
    ['Request number', record.request_number], ['Requested by', record.requested_by_name || `User #${record.requested_by}`],
    ['Department', record.department], ['Request date', formatDate(record.request_date)], ['Required date', formatDate(record.required_date)],
    ['Priority', displayName(record.priority)], ['Remarks', record.remarks],
  ] : kind === 'quotations' ? [
    ['Quotation number', record.quotation_number], ['Supplier', supplier?.name || `Supplier #${record.supplier}`],
    ['Material request', request?.request_number || `Request #${record.material_request}`], ['Quotation date', formatDate(record.quotation_date)],
    ['Valid until', formatDate(record.valid_until)], ['Grand total', formatMoney(record.total_amount)], ['Remarks', record.remarks],
  ] : kind === 'purchase-orders' ? [
    ['PO number', record.po_number], ['Supplier', supplier?.name || `Supplier #${record.supplier}`],
    ['Material request', request?.request_number || `Request #${record.material_request}`],
    ['Quotation', quotation?.quotation_number || (record.quotation ? `Quotation #${record.quotation}` : '—')],
    ['Order date', formatDate(record.order_date)], ['Expected delivery', formatDate(record.expected_delivery_date)],
    ['Subtotal', formatMoney(record.subtotal, record.currency)], ['Discount', formatMoney(record.discount_amount, record.currency)],
    ['Tax', formatMoney(record.tax_amount, record.currency)], ['Grand total', formatMoney(record.grand_total, record.currency)],
    ['Created by', `User #${record.created_by}`], ['Approved by', record.approved_by ? `User #${record.approved_by}` : '—'],
    ['Approved at', record.approved_at ? new Date(record.approved_at).toLocaleString() : '—'],
    ['Rejected by', record.rejected_by ? `User #${record.rejected_by}` : '—'],
    ['Rejected at', record.rejected_at ? new Date(record.rejected_at).toLocaleString() : '—'],
    ['Rejection reason', record.rejection_reason || '—'], ['Remarks', record.remarks],
  ] : kind === 'purchase-receipts' ? [
    ['Receipt number', record.receipt_number], ['Purchase order', `PO #${record.purchase_order}`],
    ['Warehouse', warehouse?.name || `Warehouse #${record.warehouse}`], ['Receipt date', formatDate(record.receipt_date)],
    ['Received by', `User #${record.received_by}`],
  ] : [
    ['Invoice number', record.invoice_number], ['Supplier', supplier?.name || `Supplier #${record.supplier}`],
    ['Purchase order', order?.po_number || `PO #${record.purchase_order}`], ['Invoice date', formatDate(record.invoice_date)],
    ['Due date', formatDate(record.due_date)], ['Subtotal', formatMoney(record.subtotal)], ['Tax', formatMoney(record.tax_amount)],
    ['Grand total', formatMoney(record.grand_total)], ['Paid', formatMoney(record.paid_amount)], ['Outstanding', formatMoney(record.outstanding_amount)],
  ]

  const canEdit = (kind === 'suppliers' || kind === 'items' || kind === 'quotations' || (kind === 'material-requests' && isDraft) || (kind === 'purchase-orders' && isDraft) || (kind === 'invoices' && !['PAID', 'MATCHED'].includes(recordStatus))) && isBuyer
  const canDelete = (
    (['suppliers', 'items', 'quotations'].includes(kind) && isBuyer)
    || (kind === 'material-requests' && isBuyer && isDraft)
    || (kind === 'purchase-orders' && canManagePurchase && isDraft)
    || (kind === 'invoices' && ['ADMIN', 'ACCOUNTS_USER'].includes(user?.role || '') && Number(record.paid_amount || 0) === 0)
  )
  const actionMessage: Record<string, string> = {
    submit: `Submit ${record.request_number || record.po_number} for approval?`,
    approve: `Approve ${record.request_number || record.po_number}?`,
    cancel: `Cancel ${record.request_number || record.po_number}?`,
    'mark-ordered': `Mark ${record.po_number} as ordered?`,
    reject: `Reject ${record.request_number || record.po_number}? Enter the reason below.`,
  }

  return <>
    <PageHeading title={title} subtitle="Record details and workflow history from the Django API." action={<Link className="button button--secondary" to={`/${kind}`}><ArrowLeft size={15} />Back to list</Link>} />
    <div className="detail-actions">
      {canEdit && <Button variant="secondary" onClick={() => navigate(`/${kind}/${record.id}/edit`)}><Pencil size={15} />Edit</Button>}
      {canDelete && <Button variant="danger" onClick={() => beginAction('delete')}><Trash2 size={15} />Delete</Button>}
      {kind === 'material-requests' && isBuyer && record.status === 'DRAFT' && <Button onClick={() => beginAction('submit')}>Submit request</Button>}
      {kind === 'material-requests' && canManagePurchase && record.status === 'SUBMITTED' && <>
        <Button onClick={() => beginAction('approve')}><Check size={15} />Approve</Button><Button variant="danger" onClick={() => beginAction('reject')}><X size={15} />Reject</Button>
      </>}
      {kind === 'material-requests' && isBuyer && ['DRAFT', 'SUBMITTED'].includes(recordStatus) && <Button variant="secondary" onClick={() => beginAction('cancel')}>Cancel request</Button>}
      {kind === 'purchase-orders' && isBuyer && record.status === 'DRAFT' && <Button onClick={() => beginAction('submit')}>Submit for approval</Button>}
      {kind === 'purchase-orders' && canManagePurchase && record.status === 'PENDING_APPROVAL' && <>
        <Button onClick={() => beginAction('approve')}><Check size={15} />Approve PO</Button><Button variant="danger" onClick={() => beginAction('reject')}><X size={15} />Reject</Button>
      </>}
      {kind === 'purchase-orders' && canManagePurchase && record.status === 'APPROVED' && <Button onClick={() => beginAction('mark-ordered')}>Mark ordered</Button>}
      {kind === 'purchase-orders' && canManagePurchase && ['DRAFT', 'PENDING_APPROVAL', 'APPROVED'].includes(recordStatus) && <Button variant="secondary" onClick={() => beginAction('cancel')}>Cancel PO</Button>}
      {kind === 'invoices' && ['ADMIN', 'ACCOUNTS_USER'].includes(user?.role || '') && <Button onClick={() => void runMatch()} disabled={busy}><RefreshCw size={15} />Run three-way match</Button>}
      {kind === 'invoices' && ['ADMIN', 'ACCOUNTS_USER'].includes(user?.role || '') && Number(record.outstanding_amount) > 0 && <Button variant="secondary" onClick={() => beginAction('payment')}><CreditCard size={15} />Record payment</Button>}
    </div>
    {kind === 'purchase-orders' && record.status === 'REJECTED' && <div className="notice notice--danger detail-notice"><strong>Rejected:</strong> {record.rejection_reason || 'No reason provided.'}</div>}
    <section className="detail-panel">
      <div className="detail-panel__top"><StatusBadge status={recordStatus || (record.is_active ? 'ACTIVE' : 'INACTIVE')} /><span className="detail-panel__id">Record #{record.id}</span></div>
      <div className="detail-grid">{fieldRows.map(([label, value]) => <div className="detail-field" key={label}><span>{label}</span><strong>{value || '—'}</strong></div>)}</div>
      {kind === 'invoices' && <section className="detail-section"><div className="detail-section__heading"><h3>Related receipts</h3><span>{receiptsForOrder.length} receipt(s)</span></div>
        {receiptsForOrder.length ? receiptsForOrder.map((receipt) => <div className="mini-row" key={receipt.id}><span><strong>{receipt.receipt_number}</strong><small>{formatDate(receipt.receipt_date)} · Warehouse #{receipt.warehouse}</small></span><StatusBadge status={receipt.status} /></div>) : <div className="notice">No purchase receipts are recorded for this PO yet.</div>}
      </section>}
      {lines.length > 0 && <section className="detail-section"><div className="detail-section__heading"><h3>{kind === 'material-requests' ? 'Requested items' : kind === 'quotations' ? 'Quoted items' : kind === 'purchase-orders' ? 'Order lines' : kind === 'purchase-receipts' ? 'Received quantities' : 'Invoice lines'}</h3><span>{lines.length} line(s)</span></div>
        <div className="table-scroll"><table className="comparison-table"><thead><tr><th>Item</th><th>Quantity</th><th>Rate</th><th>Tax / discount</th><th>Line amount</th></tr></thead><tbody>{lines.map((line, index) => {
          const itemId = kind === 'purchase-receipts' ? line.purchase_order_item : line.item
          const orderLine = order?.items.find((candidate) => candidate.id === itemId)
          const item = itemMap.get(line.item || orderLine?.item)
          const quantity = kind === 'purchase-receipts' ? line.received_quantity : line.quantity
          const rate = line.rate ?? line.estimated_rate ?? orderLine?.rate
          const amount = line.amount ?? (kind === 'purchase-receipts' ? Number(line.accepted_quantity || 0) * Number(orderLine?.rate || 0) : undefined)
          return <tr key={line.id || index}><td>{item ? `${item.item_code} · ${item.name}` : `Item #${itemId}`}</td><td>{formatNumber(quantity)}</td><td>{rate ? formatMoney(rate) : '—'}</td><td>{line.tax_rate ? `${formatNumber(line.tax_rate, 2)}%` : line.rejected_quantity ? `${formatNumber(line.rejected_quantity)} rejected` : '—'}</td><td>{amount !== undefined ? formatMoney(amount, record.currency || 'USD') : '—'}</td></tr>
        })}</tbody></table></div>
      </section>}
      {kind === 'invoices' && match && <section className="detail-section"><div className={`match-result ${match.result === 'MATCHED' ? '' : 'match-result--mismatch'}`}><div><strong>{match.result}</strong><div className="cell-secondary">Result returned by Django three-way matching.</div></div><span>{match.invoice_number}</span></div>
        <div className="table-scroll"><table className="comparison-table"><thead><tr><th>Comparison</th><th>PO</th><th>Receipt</th><th>Invoice</th></tr></thead><tbody>{match.details.map((detail) => {
          const poLine = order?.items.find((line) => line.item === detail.item_id)
          const invoiceLine = lines.find((line) => line.item === detail.item_id)
          const receiptQuantity = Number(detail.received_quantity)
          const poQuantity = detail.purchase_order_quantity
          const invoiceQuantity = detail.invoice_quantity
          return <FragmentRows key={detail.item_id} itemCode={detail.item_code} poQuantity={poQuantity} receiptQuantity={receiptQuantity} invoiceQuantity={invoiceQuantity} poRate={detail.purchase_order_rate} invoiceRates={detail.invoice_rates} poAmount={poLine?.amount} receiptAmount={receiptQuantity * Number(detail.purchase_order_rate || 0)} invoiceAmount={invoiceLine?.amount} />
        })}</tbody></table></div>
      </section>}
      {kind === 'invoices' && !match && <div className="workflow-note">The match status is calculated by Django, not this screen. Run matching to compare PO, accepted receipt, and invoice lines.</div>}
    </section>
    {pendingAction && <Modal title={pendingAction === 'payment' ? 'Record invoice payment' : `${displayName(pendingAction)} confirmation`} onClose={() => setPendingAction('')}>
      {pendingAction === 'payment' ? <>
        <p>Outstanding balance: <strong>{formatMoney(record.outstanding_amount)}</strong></p>
        <FormField label="Payment amount"><TextInput type="number" min="0.01" max={record.outstanding_amount} step="0.01" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} required autoFocus /></FormField>
      </> : <>
        <p>{pendingAction === 'delete' ? `Delete ${title}? This cannot be undone. The backend may reject deletion if other records depend on it.` : actionMessage[pendingAction]}</p>
        {pendingAction === 'reject' && <FormField label="Rejection reason"><textarea className="text-input" value={reason} onChange={(event) => setReason(event.target.value)} required autoFocus /></FormField>}
      </>}
      <div className="modal__actions"><Button variant="secondary" onClick={() => setPendingAction('')}>Back</Button><Button variant={pendingAction === 'reject' || pendingAction === 'delete' ? 'danger' : 'primary'} onClick={() => pendingAction === 'payment' ? void postPayment() : void confirmAction()} disabled={busy}>{busy ? <LoaderCircle className="spin" size={15} /> : null}{pendingAction === 'payment' ? 'Post payment' : displayName(pendingAction)}</Button></div>
    </Modal>}
  </>
}

function FragmentRows({ itemCode, poQuantity, receiptQuantity, invoiceQuantity, poRate, invoiceRates, poAmount, receiptAmount, invoiceAmount }: {
  itemCode: string; poQuantity: string | null; receiptQuantity: number; invoiceQuantity: string
  poRate: string | null; invoiceRates: string[]; poAmount?: string; receiptAmount: number; invoiceAmount?: string
}) {
  return <>
    <tr><td rowSpan={3}><strong>{itemCode}</strong></td><td colSpan={3} className="comparison-subhead">Quantity</td></tr>
    <tr><td>{formatNumber(poQuantity)}</td><td>{formatNumber(receiptQuantity)}</td><td>{formatNumber(invoiceQuantity)}</td></tr>
    <tr><td colSpan={3} className="comparison-subhead">Rate · {poRate ? formatMoney(poRate) : '—'} PO / {invoiceRates.map((rate) => formatMoney(rate)).join(', ') || '—'} invoice</td></tr>
    <tr><td>Amount</td><td>{poAmount ? formatMoney(poAmount) : '—'}</td><td>{formatMoney(receiptAmount)}</td><td>{invoiceAmount ? formatMoney(invoiceAmount) : '—'}</td></tr>
  </>
}