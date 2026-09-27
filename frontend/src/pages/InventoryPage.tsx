import { useEffect, useState } from 'react'
import { Archive } from 'lucide-react'
import { itemApi, type Item } from '../api/itemApi'
import { receiptApi, type StockMovement, type Warehouse } from '../api/receiptApi'
import { DataTable, PageHeading, type Column } from '../components/Primitives'
import { ErrorState, LoadingState } from '../components/LoadingState'
import { formatDate, formatNumber } from '../utils/format'

type Tab = 'items' | 'warehouses' | 'movements'

export function InventoryPage() {
  const [tab, setTab] = useState<Tab>('items')
  const [items, setItems] = useState<Item[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([itemApi.list(), receiptApi.warehouses(), receiptApi.movements()]).then(([itemRows, warehouseRows, movementRows]) => {
      setItems(itemRows); setWarehouses(warehouseRows); setMovements(movementRows)
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Inventory data is unavailable.'))
      .finally(() => setLoading(false))
  }, [])

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'items', label: 'Item balances', count: items.length },
    { key: 'warehouses', label: 'Warehouses', count: warehouses.length },
    { key: 'movements', label: 'Stock ledger', count: movements.length },
  ]
  const itemColumns: Column<Item>[] = [
    { key: 'item_code', title: 'Item code', sortable: true }, { key: 'name', title: 'Description', sortable: true },
    { key: 'category', title: 'Category' }, { key: 'current_stock', title: 'On hand', render: (row) => `${formatNumber(row.current_stock)} ${row.unit}` },
    { key: 'minimum_stock', title: 'Minimum', render: (row) => `${formatNumber(row.minimum_stock)} ${row.unit}` },
  ]
  const warehouseColumns: Column<Warehouse>[] = [
    { key: 'code', title: 'Code', sortable: true }, { key: 'name', title: 'Warehouse', sortable: true },
    { key: 'is_active', title: 'Status', render: (row) => row.is_active ? 'Active' : 'Inactive' },
  ]
  const movementColumns: Column<StockMovement>[] = [
    { key: 'transaction_date', title: 'Date', sortable: true, render: (row) => formatDate(row.transaction_date) },
    { key: 'item', title: 'Item ID' }, { key: 'warehouse', title: 'Warehouse ID' },
    { key: 'transaction_type', title: 'Type' }, { key: 'reference_id', title: 'Reference' },
    { key: 'quantity', title: 'Quantity', render: (row) => formatNumber(row.quantity) },
    { key: 'balance_quantity', title: 'Balance', render: (row) => formatNumber(row.balance_quantity) },
  ]

  return <>
    <PageHeading title="Inventory" subtitle="Live item balances, storage locations, and immutable stock movements." />
    {loading ? <LoadingState /> : error ? <ErrorState message={error} /> : <>
      <div className="segmented-tabs">{tabs.map((item) => <button key={item.key} className={tab === item.key ? 'segmented-tabs__active' : ''} onClick={() => setTab(item.key)}>{item.label}<span>{item.count}</span></button>)}</div>
      {tab === 'items' && <DataTable rows={items} columns={itemColumns} rowKey={(row) => row.id} />}
      {tab === 'warehouses' && <DataTable rows={warehouses} columns={warehouseColumns} rowKey={(row) => row.id} />}
      {tab === 'movements' && <DataTable rows={movements} columns={movementColumns} rowKey={(row) => row.id} />}
      <p className="muted-note"><Archive size={14} /> Stock levels are read from Django and change only when a posted receipt creates a stock movement.</p>
    </>}
  </>
}