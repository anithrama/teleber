import { Search, ChevronLeft, ChevronRight, ArrowUpDown, Plus, RefreshCw } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'

export function PageHeading({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return <div className="page-heading"><div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>{action && <div className="page-heading__action">{action}</div>}</div>
}

export function Button({ children, variant = 'primary', size, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'quiet' | 'danger'; size?: 'small' }) {
  return <button className={`button button--${variant} ${size ? `button--${size}` : ''} ${props.className || ''}`} {...props}>{children}</button>
}

export function FormField({ label, error, hint, children, className = '' }: { label: string; error?: string[]; hint?: string; children: ReactNode; className?: string }) {
  return <label className={`form-field ${className}`}><span className="form-field__label">{label}</span>{children}{hint && <small className="form-field__hint">{hint}</small>}{error?.map((item) => <small className="field-error" key={item}>{item}</small>)}</label>
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`text-input ${props.className || ''}`} {...props} />
}

export function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`text-input select-input ${props.className || ''}`} {...props} />
}

export type Column<T> = { key: string; title: string; render?: (row: T) => ReactNode; sortable?: boolean; className?: string }

export function DataTable<T extends object>({
  rows, columns, rowKey, onRowClick, searchPlaceholder = 'Search records', emptyTitle = 'No records found', emptyText = 'Try adjusting your search or filters.',
  onRefresh, extraFilter,
}: {
  rows: T[]; columns: Column<T>[]; rowKey: (row: T) => string | number; onRowClick?: (row: T) => void
  searchPlaceholder?: string; emptyTitle?: string; emptyText?: string
  onRefresh?: () => void; extraFilter?: ReactNode
}) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sort, setSort] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null)
  const statuses = [...new Set(rows.map((row) => String((row as Record<string, unknown>).status || '')).filter(Boolean))]
  const visibleRows = useMemo(() => {
    let filtered = rows.filter((row) => {
      const data = JSON.stringify(row).toLocaleLowerCase()
      const status = String((row as Record<string, unknown>).status || '')
      return data.includes(search.toLocaleLowerCase()) && (statusFilter === 'all' || status === statusFilter)
    })
    if (sort) {
      const { key, direction } = sort
      filtered = [...filtered].sort((left, right) => {
        const a = String((left as Record<string, unknown>)[key] ?? '')
        const b = String((right as Record<string, unknown>)[key] ?? '')
        return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }) * (direction === 'asc' ? 1 : -1)
      })
    }
    return filtered
  }, [rows, search, sort, statusFilter])
  const [page, setPage] = useState(1)
  const pageSize = 10
  const pageCount = Math.max(1, Math.ceil(visibleRows.length / pageSize))
  const pageRows = visibleRows.slice((page - 1) * pageSize, page * pageSize)

  return <section className="table-panel">
    <div className="table-toolbar"><label className="search-box"><Search size={17} /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder={searchPlaceholder} aria-label={searchPlaceholder} /></label>
      {statuses.length > 0 && <label className="filter-control"><span>Status</span><select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1) }}><option value="all">All statuses</option>{statuses.map((status) => <option value={status} key={status}>{status.replaceAll('_', ' ')}</option>)}</select></label>}
      {extraFilter}
      <span className="table-toolbar__count">{visibleRows.length} records</span>
      {onRefresh && <button className="icon-button table-refresh" title="Refresh records" aria-label="Refresh records" onClick={onRefresh}><RefreshCw size={15} /></button>}
    </div>
    {pageRows.length ? <div className="table-scroll"><table className="data-table"><thead><tr>{columns.map((column) => <th className={column.className || ''} key={column.key}><button className="sort-button" onClick={() => column.sortable && setSort((current) => current?.key === column.key ? { key: column.key, direction: current.direction === 'asc' ? 'desc' : 'asc' } : { key: column.key, direction: 'asc' })} disabled={!column.sortable}>{column.title}{column.sortable && <ArrowUpDown size={13} />}</button></th>)}</tr></thead><tbody>{pageRows.map((row) => <tr key={rowKey(row)} className={onRowClick ? 'data-table__row--clickable' : ''} onClick={() => onRowClick?.(row)}>{columns.map((column) => <td key={column.key} className={column.className || ''}>{column.render ? column.render(row) : String((row as Record<string, unknown>)[column.key] ?? '—')}</td>)}</tr>)}</tbody></table></div> : <div className="empty-state"><span className="empty-state__icon"><Plus size={20} /></span><strong>{emptyTitle}</strong><span>{search ? 'No matching records. Clear the search to see all results.' : emptyText}</span></div>}
    <footer className="table-pagination"><span>Showing {visibleRows.length ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, visibleRows.length)} of {visibleRows.length}</span><div><button className="icon-button" disabled={page <= 1} aria-label="Previous page" onClick={() => setPage((current) => Math.max(1, current - 1))}><ChevronLeft size={17} /></button><span>{page} / {pageCount}</span><button className="icon-button" disabled={page >= pageCount} aria-label="Next page" onClick={() => setPage((current) => Math.min(pageCount, current + 1))}><ChevronRight size={17} /></button></div></footer>
  </section>
}