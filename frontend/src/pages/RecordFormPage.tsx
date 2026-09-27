import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArrowLeft, LoaderCircle, Plus, Trash2 } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { invoiceApi } from '../api/invoiceApi'
import { itemApi, type Item } from '../api/itemApi'
import { materialRequestApi, type MaterialRequest } from '../api/materialRequestApi'
import { purchaseOrderApi, type PurchaseOrder } from '../api/purchaseOrderApi'
import { quotationApi, type Quotation } from '../api/quotationApi'
import { receiptApi, type Warehouse } from '../api/receiptApi'
import { supplierApi, type Supplier } from '../api/supplierApi'
import { apiErrorMessage, apiFieldErrors } from '../api/client'
import type { ResourceKind } from './ResourceListPage'
import { Button, FormField, PageHeading, SelectInput, TextInput } from '../components/Primitives'
import { LoadingState } from '../components/LoadingState'
import { useToast } from '../context/ToastContext'
import { formatNumber } from '../utils/format'

type Line = Record<string, string>
type Values = Record<string, string>
type FormOptions = { suppliers: Supplier[]; items: Item[]; requests: MaterialRequest[]; quotations: Quotation[]; orders: PurchaseOrder[]; warehouses: Warehouse[] }
const today = () => new Date().toISOString().slice(0, 10)
const blankLine = (): Line => ({ item: '', quantity: '1', estimated_rate: '', rate: '', tax_rate: '0', discount: '0', rejected_quantity: '0', remarks: '' })

const titles: Record<ResourceKind, string> = {
  suppliers: 'Supplier', items: 'Item', 'material-requests': 'Material request', quotations: 'Supplier quotation',
  'purchase-orders': 'Purchase order', 'purchase-receipts': 'Purchase receipt', invoices: 'Purchase invoice',
}

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

async function getOptions(kind: ResourceKind): Promise<FormOptions> {
  const empty: FormOptions = { suppliers: [], items: [], requests: [], quotations: [], orders: [], warehouses: [] }
  const tasks: Promise<unknown>[] = []
  const keys: (keyof FormOptions)[] = []
  if (['quotations', 'purchase-orders', 'invoices'].includes(kind)) { tasks.push(supplierApi.list()); keys.push('suppliers') }
  if (['material-requests', 'quotations', 'purchase-orders', 'invoices'].includes(kind)) { tasks.push(itemApi.list()); keys.push('items') }
  if (['quotations', 'purchase-orders'].includes(kind)) { tasks.push(materialRequestApi.list()); keys.push('requests') }
  if (kind === 'purchase-orders') { tasks.push(quotationApi.list()); keys.push('quotations') }
  if (['purchase-receipts', 'invoices'].includes(kind)) { tasks.push(purchaseOrderApi.list()); keys.push('orders') }
  if (kind === 'purchase-receipts') { tasks.push(receiptApi.warehouses()); keys.push('warehouses') }
  const values = await Promise.all(tasks)
  values.forEach((value, index) => { empty[keys[index]] = value as never })
  return empty
}

export function RecordFormPage({ kind }: { kind: ResourceKind }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const { notify } = useToast()
  const [values, setValues] = useState<Values>({
    request_date: today(), quotation_date: today(), order_date: today(), receipt_date: today(), invoice_date: today(),
    required_date: today(), valid_until: today(), expected_delivery_date: today(), due_date: today(),
    currency: 'USD', priority: 'NORMAL', status: kind === 'suppliers' ? 'ACTIVE' : 'DRAFT', is_active: 'true',
  })
  const [lines, setLines] = useState<Line[]>(kind === 'purchase-receipts' ? [] : [blankLine()])
  const [options, setOptions] = useState<FormOptions>({ suppliers: [], items: [], requests: [], quotations: [], orders: [], warehouses: [] })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const isEditing = Boolean(id)
  const heading = `${isEditing ? 'Edit' : 'New'} ${titles[kind].toLocaleLowerCase()}`
  const selectedOrder = options.orders.find((order) => String(order.id) === values.purchase_order)
  const eligibleOrders = options.orders.filter((order) => ['APPROVED', 'ORDERED', 'PARTIALLY_RECEIVED'].includes(order.status))
  const activeSuppliers = options.suppliers.filter((supplier) => supplier.status === 'ACTIVE' || String(supplier.id) === values.supplier)

  useEffect(() => {
    let active = true
    setLoading(true)
    Promise.all([
      getOptions(kind),
      id ? getRecord(kind, id) : Promise.resolve(null),
    ]).then(([formOptions, record]) => {
      if (!active) return
      setOptions(formOptions)
      if (record) {
        const current = record as unknown as Record<string, unknown>
        const nextValues: Values = {}
        Object.entries(current).forEach(([key, value]) => {
          if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') nextValues[key] = String(value)
        })
        setValues((previous) => ({ ...previous, ...nextValues }))
        if (Array.isArray(current.items)) setLines((current.items as Record<string, unknown>[]).map((line) => Object.fromEntries(Object.entries(line).map(([key, value]) => [key, String(value ?? '')]))))
      }
    }).catch((reason: unknown) => {
      if (active) setError(apiErrorMessage(reason))
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [kind, id])

  function setValue(key: string, value: string) {
    setValues((current) => ({ ...current, [key]: value }))
    setFieldErrors((current) => ({ ...current, [key]: [] }))
  }

  function setLine(index: number, key: string, value: string) {
    setLines((current) => current.map((line, row) => row === index ? { ...line, [key]: value } : line))
    setFieldErrors((current) => ({ ...current, items: [] }))
  }

  function selectRequest(requestId: string) {
    setValue('material_request', requestId)
    const request = options.requests.find((row) => String(row.id) === requestId)
    if (request) setLines(request.items.map((line) => ({
      ...blankLine(), item: String(line.item), quantity: String(line.quantity),
      estimated_rate: String(line.estimated_rate), rate: String(line.estimated_rate),
      tax_rate: String(options.items.find((item) => item.id === line.item)?.tax_rate ?? '0'),
    })))
  }

  function selectQuotation(quotationId: string) {
    setValue('quotation', quotationId)
    const quotation = options.quotations.find((row) => String(row.id) === quotationId)
    if (quotation) {
      setValue('supplier', String(quotation.supplier))
      setValue('material_request', String(quotation.material_request))
      setLines(quotation.items.map((line) => ({
        ...blankLine(), item: String(line.item), quantity: String(line.quantity),
        rate: String(line.rate), tax_rate: String(line.tax_rate),
      })))
    }
  }

  function selectOrder(orderId: string) {
    setValue('purchase_order', orderId)
    const order = options.orders.find((row) => String(row.id) === orderId)
    if (!order) return
    setValue('supplier', String(order.supplier))
    if (kind === 'purchase-receipts') {
      setLines(order.items.filter((line) => Number(line.quantity) > Number(line.received_quantity)).map((line) => ({
        ...blankLine(), purchase_order_item: String(line.id), item: String(line.item),
        quantity: String(line.quantity), received_quantity: String(line.received_quantity),
        remaining: String(Number(line.quantity) - Number(line.received_quantity)), received: '', rejected_quantity: '0',
      })))
    } else {
      setLines(order.items.map((line) => ({
        ...blankLine(), item: String(line.item), quantity: String(Number(line.received_quantity) || Number(line.quantity)),
        rate: String(line.rate), tax_rate: String(line.tax_rate),
      })))
    }
  }

  function validateForm() {
    const errors: Record<string, string[]> = {}
    const required = kind === 'suppliers' ? ['supplier_code', 'name']
      : kind === 'items' ? ['item_code', 'name']
      : kind === 'material-requests' ? ['request_number', 'department', 'request_date', 'required_date']
      : kind === 'quotations' ? ['quotation_number', 'supplier', 'material_request', 'quotation_date', 'valid_until']
      : kind === 'purchase-orders' ? ['po_number', 'supplier', 'material_request', 'order_date', 'expected_delivery_date']
      : kind === 'purchase-receipts' ? ['receipt_number', 'purchase_order', 'warehouse', 'receipt_date']
      : ['invoice_number', 'supplier', 'purchase_order', 'invoice_date', 'due_date']
    required.forEach((field) => { if (!values[field]?.trim()) errors[field] = ['This field is required.'] })
    const hasLines = ['material-requests', 'quotations', 'purchase-orders', 'purchase-receipts', 'invoices'].includes(kind)
    if (hasLines && !lines.length) errors.items = ['Add at least one line item.']
    for (const line of lines) {
      if (hasLines && !line.item && kind !== 'purchase-receipts') errors.items = ['Select an item for every line.']
      if (kind === 'purchase-receipts') {
        if (!values.purchase_order) continue
        if (!line.purchase_order_item) errors.items = ['Select an order line.']
        if (!line.received || Number(line.received) <= 0) errors.items = ['Received quantity must be greater than zero.']
        if (Number(line.received) > Number(line.remaining)) errors.items = ['Received quantity cannot exceed the remaining PO quantity.']
        if (Number(line.rejected_quantity || 0) > Number(line.received || 0)) errors.items = ['Rejected quantity cannot exceed received quantity.']
      } else if (hasLines && (!line.quantity || Number(line.quantity) <= 0)) errors.items = ['Line quantity must be greater than zero.']
      for (const rateField of ['rate', 'estimated_rate', 'tax_rate', 'discount']) {
        if (line[rateField] !== undefined && line[rateField] !== '' && Number(line[rateField]) < 0) errors.items = ['Rates, tax, and discounts cannot be negative.']
      }
    }
    const datePairs: [string, string][] = kind === 'material-requests' ? [['request_date', 'required_date']]
      : kind === 'quotations' ? [['quotation_date', 'valid_until']]
      : kind === 'purchase-orders' ? [['order_date', 'expected_delivery_date']]
      : kind === 'invoices' ? [['invoice_date', 'due_date']] : []
    datePairs.forEach(([start, end]) => { if (values[start] && values[end] && values[end] < values[start]) errors[end] = ['Date cannot be before the start date.'] })
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (!validateForm()) return
    setSaving(true)
    setFieldErrors({})
    try {
      let result: { id: number } | undefined
      if (kind === 'suppliers') {
        const data = { ...values, email: values.email || '', status: (values.status || 'ACTIVE') as Supplier['status'] }
        result = isEditing ? await supplierApi.update(id!, data) : await supplierApi.create(data)
      } else if (kind === 'items') {
        const data = { ...values, is_active: values.is_active !== 'false' }
        result = isEditing ? await itemApi.update(id!, data) : await itemApi.create(data)
      } else if (kind === 'material-requests') {
        const data = { ...values, items: lines.map((line) => ({ item: Number(line.item), quantity: line.quantity, estimated_rate: line.estimated_rate || '0', remarks: line.remarks || '' })) }
        result = isEditing ? await materialRequestApi.update(id!, data) : await materialRequestApi.create(data)
      } else if (kind === 'quotations') {
        const data = { ...values, supplier: Number(values.supplier), material_request: Number(values.material_request), items: lines.map((line) => ({ item: Number(line.item), quantity: line.quantity, rate: line.rate, tax_rate: line.tax_rate || '0' })) }
        result = isEditing ? await quotationApi.update(id!, data) : await quotationApi.create(data)
      } else if (kind === 'purchase-orders') {
        const data = { ...values, supplier: Number(values.supplier), material_request: Number(values.material_request), quotation: values.quotation ? Number(values.quotation) : null, items: lines.map((line) => ({ item: Number(line.item), quantity: line.quantity, rate: line.rate, tax_rate: line.tax_rate || '0', discount: line.discount || '0' })) }
        result = isEditing ? await purchaseOrderApi.update(id!, data) : await purchaseOrderApi.create(data)
      } else if (kind === 'purchase-receipts') {
        result = await receiptApi.create({
          receipt_number: values.receipt_number,
          purchase_order: Number(values.purchase_order), warehouse: Number(values.warehouse), receipt_date: values.receipt_date,
          items: lines.filter((line) => Number(line.received) > 0).map((line) => ({
            purchase_order_item: Number(line.purchase_order_item), received_quantity: line.received,
            rejected_quantity: line.rejected_quantity || '0',
          })),
        })
      } else {
        const data = { ...values, supplier: Number(values.supplier), purchase_order: Number(values.purchase_order), items: lines.map((line) => ({ item: Number(line.item), quantity: line.quantity, rate: line.rate, tax_rate: line.tax_rate || '0' })) }
        result = isEditing ? await invoiceApi.update(id!, data) : await invoiceApi.create(data)
      }
      notify(`${titles[kind]} ${isEditing ? 'updated' : 'created'} successfully.`)
      navigate(`/${kind}/${result?.id || id}`)
    } catch (reason) {
      const errors = apiFieldErrors(reason)
      setFieldErrors(errors)
      setError(apiErrorMessage(reason))
    } finally { setSaving(false) }
  }

  const canHaveLines = ['material-requests', 'quotations', 'purchase-orders', 'purchase-receipts', 'invoices'].includes(kind)
  const lineTitle = kind === 'material-requests' ? 'Requested items' : kind === 'quotations' ? 'Quoted items' : kind === 'purchase-orders' ? 'Order lines' : kind === 'purchase-receipts' ? 'Received items' : 'Invoice lines'
  const readyLineOptions = useMemo(() => options.items.filter((item) => item.is_active), [options.items])

  if (loading) return <LoadingState label={isEditing ? 'Loading record' : 'Loading form options'} />
  if (error && isEditing && !values.id) return <div className="form-error-summary">{error}<Link to={`/${kind}`}>Return to list</Link></div>

  return <>
    <PageHeading title={heading} subtitle={isEditing ? 'Update fields and save the record.' : 'Enter the record details. The API remains authoritative for validation and totals.'} action={<Link className="button button--secondary" to={`/${kind}`}><ArrowLeft size={15} />Back to list</Link>} />
    <form className="form-panel" onSubmit={save} noValidate>
      {error && <div className="form-error-summary" role="alert">{error}</div>}
      {kind === 'suppliers' && <div className="form-grid">
        <FormField label="Supplier code" error={fieldErrors.supplier_code}><TextInput value={values.supplier_code || ''} onChange={(event) => setValue('supplier_code', event.target.value)} required /></FormField>
        <FormField label="Name" error={fieldErrors.name}><TextInput value={values.name || ''} onChange={(event) => setValue('name', event.target.value)} required /></FormField>
        <FormField label="Email" error={fieldErrors.email}><TextInput type="email" value={values.email || ''} onChange={(event) => setValue('email', event.target.value)} /></FormField>
        <FormField label="Phone"><TextInput value={values.phone || ''} onChange={(event) => setValue('phone', event.target.value)} /></FormField>
        <FormField label="City"><TextInput value={values.city || ''} onChange={(event) => setValue('city', event.target.value)} /></FormField>
        <FormField label="State / region"><TextInput value={values.state || ''} onChange={(event) => setValue('state', event.target.value)} /></FormField>
        <FormField label="Country"><TextInput value={values.country || ''} onChange={(event) => setValue('country', event.target.value)} /></FormField>
        <FormField label="Tax number"><TextInput value={values.tax_number || ''} onChange={(event) => setValue('tax_number', event.target.value)} /></FormField>
        <FormField label="Payment terms"><TextInput value={values.payment_terms || ''} onChange={(event) => setValue('payment_terms', event.target.value)} placeholder="Net 30" /></FormField>
        <FormField label="Status" error={fieldErrors.status}><SelectInput value={values.status || 'ACTIVE'} onChange={(event) => setValue('status', event.target.value)}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></SelectInput></FormField>
        <FormField label="Address" className="form-field--full"><TextInput value={values.address || ''} onChange={(event) => setValue('address', event.target.value)} /></FormField>
      </div>}

      {kind === 'items' && <div className="form-grid">
        <FormField label="Item code" error={fieldErrors.item_code}><TextInput value={values.item_code || ''} onChange={(event) => setValue('item_code', event.target.value)} required /></FormField>
        <FormField label="Name" error={fieldErrors.name}><TextInput value={values.name || ''} onChange={(event) => setValue('name', event.target.value)} required /></FormField>
        <FormField label="Category"><TextInput value={values.category || ''} onChange={(event) => setValue('category', event.target.value)} /></FormField>
        <FormField label="Unit"><TextInput value={values.unit || 'Each'} onChange={(event) => setValue('unit', event.target.value)} required /></FormField>
        <FormField label="Purchase rate" error={fieldErrors.purchase_rate}><TextInput type="number" min="0" step="0.01" value={values.purchase_rate || '0'} onChange={(event) => setValue('purchase_rate', event.target.value)} required /></FormField>
        <FormField label="Tax rate (%)" error={fieldErrors.tax_rate}><TextInput type="number" min="0" step="0.01" value={values.tax_rate || '0'} onChange={(event) => setValue('tax_rate', event.target.value)} required /></FormField>
        <FormField label="Minimum stock"><TextInput type="number" min="0" step="0.001" value={values.minimum_stock || '0'} onChange={(event) => setValue('minimum_stock', event.target.value)} /></FormField>
        <FormField label="Active"><SelectInput value={values.is_active || 'true'} onChange={(event) => setValue('is_active', event.target.value)}><option value="true">Active</option><option value="false">Inactive</option></SelectInput></FormField>
        <FormField label="Description" className="form-field--full"><textarea className="text-input" value={values.description || ''} onChange={(event) => setValue('description', event.target.value)} /></FormField>
        {isEditing && <div className="form-field"><span className="form-field__label">Current stock</span><TextInput value={values.current_stock || '0'} disabled /></div>}
      </div>}

      {kind === 'material-requests' && <div className="form-grid">
        <FormField label="Request number" error={fieldErrors.request_number}><TextInput value={values.request_number || ''} onChange={(event) => setValue('request_number', event.target.value)} required /></FormField>
        <FormField label="Department" error={fieldErrors.department}><TextInput value={values.department || ''} onChange={(event) => setValue('department', event.target.value)} required /></FormField>
        <FormField label="Request date" error={fieldErrors.request_date}><TextInput type="date" value={values.request_date || today()} onChange={(event) => setValue('request_date', event.target.value)} required /></FormField>
        <FormField label="Required date" error={fieldErrors.required_date}><TextInput type="date" value={values.required_date || today()} onChange={(event) => setValue('required_date', event.target.value)} required /></FormField>
        <FormField label="Priority"><SelectInput value={values.priority || 'NORMAL'} onChange={(event) => setValue('priority', event.target.value)}>{['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((priority) => <option key={priority}>{priority}</option>)}</SelectInput></FormField>
        <FormField label="Remarks"><TextInput value={values.remarks || ''} onChange={(event) => setValue('remarks', event.target.value)} /></FormField>
      </div>}

      {kind === 'quotations' && <div className="form-grid">
        <FormField label="Quotation number" error={fieldErrors.quotation_number}><TextInput value={values.quotation_number || ''} onChange={(event) => setValue('quotation_number', event.target.value)} required /></FormField>
        <FormField label="Supplier" error={fieldErrors.supplier}><SelectInput value={values.supplier || ''} onChange={(event) => setValue('supplier', event.target.value)} required><option value="">Choose supplier</option>{activeSuppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.supplier_code} · {supplier.name}</option>)}</SelectInput></FormField>
        <FormField label="Material request" error={fieldErrors.material_request}><SelectInput value={values.material_request || ''} onChange={(event) => selectRequest(event.target.value)} required><option value="">Choose request</option>{options.requests.map((request) => <option key={request.id} value={request.id}>{request.request_number} · {request.department}</option>)}</SelectInput></FormField>
        <FormField label="Quotation date"><TextInput type="date" value={values.quotation_date || today()} onChange={(event) => setValue('quotation_date', event.target.value)} required /></FormField>
        <FormField label="Valid until"><TextInput type="date" value={values.valid_until || today()} onChange={(event) => setValue('valid_until', event.target.value)} required /></FormField>
        <FormField label="Status"><SelectInput value={values.status || 'DRAFT'} onChange={(event) => setValue('status', event.target.value)}><option value="DRAFT">Draft</option><option value="SUBMITTED">Submitted</option></SelectInput></FormField>
        <FormField label="Remarks" className="form-field--full"><textarea className="text-input" value={values.remarks || ''} onChange={(event) => setValue('remarks', event.target.value)} /></FormField>
      </div>}

      {kind === 'purchase-orders' && <div className="form-grid">
        <FormField label="PO number" error={fieldErrors.po_number}><TextInput value={values.po_number || ''} onChange={(event) => setValue('po_number', event.target.value)} required /></FormField>
        <FormField label="Supplier" error={fieldErrors.supplier}><SelectInput value={values.supplier || ''} onChange={(event) => setValue('supplier', event.target.value)} required><option value="">Choose supplier</option>{activeSuppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.supplier_code} · {supplier.name}</option>)}</SelectInput></FormField>
        <FormField label="Material request"><SelectInput value={values.material_request || ''} onChange={(event) => selectRequest(event.target.value)} required><option value="">Choose request</option>{options.requests.map((request) => <option key={request.id} value={request.id}>{request.request_number}</option>)}</SelectInput></FormField>
        <FormField label="Supplier quotation"><SelectInput value={values.quotation || ''} onChange={(event) => selectQuotation(event.target.value)}><option value="">No quotation selected</option>{options.quotations.filter((quote) => !values.material_request || String(quote.material_request) === values.material_request).map((quote) => <option key={quote.id} value={quote.id}>{quote.quotation_number} · {formatNumber(quote.total_amount, 2)}</option>)}</SelectInput></FormField>
        <FormField label="Order date"><TextInput type="date" value={values.order_date || today()} onChange={(event) => setValue('order_date', event.target.value)} required /></FormField>
        <FormField label="Expected delivery"><TextInput type="date" value={values.expected_delivery_date || today()} onChange={(event) => setValue('expected_delivery_date', event.target.value)} required /></FormField>
        <FormField label="Currency"><TextInput maxLength={3} value={values.currency || 'USD'} onChange={(event) => setValue('currency', event.target.value.toUpperCase())} /></FormField>
        <FormField label="Remarks"><TextInput value={values.remarks || ''} onChange={(event) => setValue('remarks', event.target.value)} /></FormField>
      </div>}

      {kind === 'purchase-receipts' && <div className="form-grid">
        <FormField label="Receipt number" error={fieldErrors.receipt_number}><TextInput value={values.receipt_number || ''} onChange={(event) => setValue('receipt_number', event.target.value)} required /></FormField>
        <FormField label="Purchase order" error={fieldErrors.purchase_order}><SelectInput value={values.purchase_order || ''} onChange={(event) => selectOrder(event.target.value)} required><option value="">Choose an order ready to receive</option>{eligibleOrders.map((order) => <option key={order.id} value={order.id}>{order.po_number} · {order.status}</option>)}</SelectInput></FormField>
        <FormField label="Warehouse" error={fieldErrors.warehouse}><SelectInput value={values.warehouse || ''} onChange={(event) => setValue('warehouse', event.target.value)} required><option value="">Choose warehouse</option>{options.warehouses.filter((warehouse) => warehouse.is_active).map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}</SelectInput></FormField>
        <FormField label="Receipt date"><TextInput type="date" value={values.receipt_date || today()} onChange={(event) => setValue('receipt_date', event.target.value)} required /></FormField>
        {eligibleOrders.length === 0 && <div className="notice notice--danger form-field--full">No purchase orders are currently eligible for receiving. A purchase manager must approve an order, then mark it ordered before it can be received.</div>}
      </div>}

      {kind === 'invoices' && <div className="form-grid">
        <FormField label="Invoice number" error={fieldErrors.invoice_number}><TextInput value={values.invoice_number || ''} onChange={(event) => setValue('invoice_number', event.target.value)} required /></FormField>
        <FormField label="Purchase order" error={fieldErrors.purchase_order}><SelectInput value={values.purchase_order || ''} onChange={(event) => selectOrder(event.target.value)} required><option value="">Choose purchase order</option>{options.orders.map((order) => <option key={order.id} value={order.id}>{order.po_number} · {order.status}</option>)}</SelectInput></FormField>
        <FormField label="Supplier"><SelectInput value={values.supplier || ''} onChange={(event) => setValue('supplier', event.target.value)} required><option value="">Select a purchase order first</option>{activeSuppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.supplier_code} · {supplier.name}</option>)}</SelectInput></FormField>
        <FormField label="Invoice date"><TextInput type="date" value={values.invoice_date || today()} onChange={(event) => setValue('invoice_date', event.target.value)} required /></FormField>
        <FormField label="Due date"><TextInput type="date" value={values.due_date || today()} onChange={(event) => setValue('due_date', event.target.value)} required /></FormField>
      </div>}

      {canHaveLines && <section className="line-items">
        <div className="line-items__heading"><div><h3>{lineTitle}</h3><p>Line values are sent to Django; authoritative totals come back from the API.</p></div>{kind !== 'purchase-receipts' && <Button type="button" variant="secondary" size="small" onClick={() => setLines((current) => [...current, blankLine()])}><Plus size={14} />Add line</Button>}</div>
        {fieldErrors.items?.length ? <div className="form-error-summary">{fieldErrors.items.join(' ')}</div> : null}
        {lines.map((line, index) => {
          const selectedItem = options.items.find((item) => String(item.id) === line.item)
          const orderLine = selectedOrder?.items.find((item) => String(item.id) === line.purchase_order_item)
          return <div className={`line-item-row ${kind === 'purchase-receipts' ? 'line-item-row--receipt' : ''}`} key={`${line.item || 'line'}-${index}`}>
            {kind === 'purchase-receipts' ? <div className="line-item-row__info"><strong>{selectedItem?.item_code || `Order line ${line.purchase_order_item || ''}`}</strong><small>{selectedItem?.name || `Ordered ${line.quantity || '—'} · received ${line.received_quantity || '0'} · remaining ${line.remaining || '—'}`}</small></div>
              : <FormField label="Item" error={fieldErrors.items}><SelectInput value={line.item || ''} onChange={(event) => {
                const item = readyLineOptions.find((entry) => String(entry.id) === event.target.value)
                setLine(index, 'item', event.target.value)
                if (item) { if (kind === 'material-requests') setLine(index, 'estimated_rate', String(item.purchase_rate)); else { setLine(index, 'rate', String(item.purchase_rate)); setLine(index, 'tax_rate', String(item.tax_rate)) } }
              }}><option value="">Choose item</option>{readyLineOptions.map((item) => <option key={item.id} value={item.id}>{item.item_code} · {item.name}</option>)}</SelectInput></FormField>}
            {kind === 'material-requests' && <>
              <FormField label="Quantity"><TextInput type="number" min="0.001" step="0.001" value={line.quantity || ''} onChange={(event) => setLine(index, 'quantity', event.target.value)} /></FormField>
              <FormField label="Estimated rate"><TextInput type="number" min="0" step="0.01" value={line.estimated_rate || ''} onChange={(event) => setLine(index, 'estimated_rate', event.target.value)} /></FormField>
              <Button type="button" variant="quiet" aria-label="Remove line" disabled={lines.length <= 1} onClick={() => setLines((current) => current.filter((_row, row) => row !== index))}><Trash2 size={16} /></Button>
            </>}
            {(kind === 'quotations' || kind === 'purchase-orders' || kind === 'invoices') && <>
              <FormField label="Quantity"><TextInput type="number" min="0.001" step="0.001" value={line.quantity || ''} onChange={(event) => setLine(index, 'quantity', event.target.value)} /></FormField>
              <FormField label="Rate"><TextInput type="number" min="0" step="0.01" value={line.rate || ''} onChange={(event) => setLine(index, 'rate', event.target.value)} /></FormField>
              <FormField label="Tax %"><TextInput type="number" min="0" step="0.01" value={line.tax_rate || '0'} onChange={(event) => setLine(index, 'tax_rate', event.target.value)} /></FormField>
              {kind === 'purchase-orders' && <FormField label="Discount"><TextInput type="number" min="0" step="0.01" value={line.discount || '0'} onChange={(event) => setLine(index, 'discount', event.target.value)} /></FormField>}
              <Button type="button" variant="quiet" aria-label="Remove line" disabled={lines.length <= 1} onClick={() => setLines((current) => current.filter((_row, row) => row !== index))}><Trash2 size={16} /></Button>
            </>}
            {kind === 'purchase-receipts' && <>
              <FormField label="Ordered"><TextInput value={line.quantity || ''} disabled /></FormField>
              <FormField label="Previously received"><TextInput value={line.received_quantity || ''} disabled /></FormField>
              <FormField label="Remaining"><TextInput value={line.remaining || ''} disabled /></FormField>
              <FormField label="Receive now"><TextInput type="number" min="0" max={line.remaining} step="0.001" value={line.received || ''} onChange={(event) => setLine(index, 'received', event.target.value)} /></FormField>
              <FormField label="Rejected"><TextInput type="number" min="0" max={line.received || '0'} step="0.001" value={line.rejected_quantity || '0'} onChange={(event) => setLine(index, 'rejected_quantity', event.target.value)} /></FormField>
              <input type="hidden" value={orderLine?.item ?? ''} readOnly />
            </>}
          </div>
        })}
      </section>}
      <div className="form-actions"><Button type="button" variant="secondary" onClick={() => navigate(`/${kind}`)}>Cancel</Button><Button type="submit" disabled={saving || (kind === 'purchase-receipts' && (!values.purchase_order || eligibleOrders.length === 0))}>{saving ? <LoaderCircle className="spin" size={15} /> : null}{saving ? 'Saving' : isEditing ? 'Save changes' : `Create ${titles[kind].toLocaleLowerCase()}`}</Button></div>
    </form>
  </>
}