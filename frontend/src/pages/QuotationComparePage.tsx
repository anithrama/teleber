import { useEffect, useState } from 'react'
import { ArrowRightLeft, Search } from 'lucide-react'
import { materialRequestApi, type MaterialRequest } from '../api/materialRequestApi'
import { quotationApi, type ComparisonLine } from '../api/quotationApi'
import { ErrorState, LoadingState } from '../components/LoadingState'
import { Button, FormField, PageHeading, SelectInput } from '../components/Primitives'
import { formatDate, formatMoney, formatNumber } from '../utils/format'

export function QuotationComparePage() {
  const [requests, setRequests] = useState<MaterialRequest[]>([])
  const [requestId, setRequestId] = useState('')
  const [offers, setOffers] = useState<ComparisonLine[]>([])
  const [loading, setLoading] = useState(true)
  const [comparing, setComparing] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    materialRequestApi.list().then(setRequests).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Material requests are unavailable.')).finally(() => setLoading(false))
  }, [])

  async function compare() {
    if (!requestId) return
    setComparing(true)
    setError('')
    try { setOffers(await quotationApi.compare(Number(requestId))) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not compare supplier quotations.') }
    finally { setComparing(false) }
  }

  const selectedRequest = requests.find((request) => String(request.id) === requestId)
  const groupByItem = new Map<string, ComparisonLine[]>()
  offers.forEach((offer) => groupByItem.set(offer.item_code, [...(groupByItem.get(offer.item_code) || []), offer]))

  return <>
    <PageHeading title="Quotation comparison" subtitle="Compare live supplier quotations item by item. Supplier selection remains a buyer decision." />
    {loading ? <LoadingState label="Loading material requests" /> : error && !offers.length ? <ErrorState message={error} /> : <>
      <div className="compare-toolbar"><FormField label="Material request"><SelectInput value={requestId} onChange={(event) => setRequestId(event.target.value)}><option value="">Choose a request</option>{requests.map((request) => <option key={request.id} value={request.id}>{request.request_number} · {request.department} · {request.status}</option>)}</SelectInput></FormField><Button onClick={() => void compare()} disabled={!requestId || comparing}>{comparing ? 'Comparing…' : <><Search size={15} />Compare offers</>}</Button>{selectedRequest && <span className="compare-request-meta"><ArrowRightLeft size={14} />{selectedRequest.items.length} requested line(s) · required {formatDate(selectedRequest.required_date)}</span>}</div>
      {error && <div className="form-error-summary" role="alert">{error}</div>}
      {!offers.length ? <div className="table-panel"><div className="empty-state"><span className="empty-state__icon"><ArrowRightLeft size={19} /></span><strong>{requestId ? 'No quotations found for this request' : 'Select a material request'}</strong><span>Comparison results come directly from supplier quotations in Django.</span></div></div> : <div className="comparison-groups">{[...groupByItem].map(([itemCode, itemOffers]) => <section className="table-panel" key={itemCode}><header className="dashboard-panel__header"><h2>{itemCode} · {itemOffers[0].item}</h2><span>{itemOffers.length} offer(s)</span></header><div className="table-scroll"><table className="comparison-table"><thead><tr><th>Supplier</th><th>Quotation</th><th>Quantity</th><th>Rate</th><th>Tax</th><th>Subtotal</th><th>Quoted total</th><th>Valid until</th></tr></thead><tbody>{itemOffers.map((offer) => <tr key={`${offer.quotation_number}-${offer.item_code}`}><td><strong>{offer.supplier}</strong></td><td>{offer.quotation_number}</td><td>{formatNumber(offer.quantity)}</td><td className="comparison-price">{formatMoney(offer.rate)}</td><td>{formatMoney(offer.tax)}</td><td>{formatMoney(offer.subtotal)}</td><td><strong>{formatMoney(offer.grand_total)}</strong></td><td>{formatDate(offer.valid_until)}</td></tr>)}</tbody></table></div></section>)}</div>}
    </>}
  </>
}