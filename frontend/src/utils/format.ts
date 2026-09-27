export function formatMoney(value: string | number | null | undefined, currency = 'USD') {
  if (value === null || value === undefined || value === '') return '—'
  return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(value))
}

export function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(`${value.slice(0, 10)}T00:00:00`))
}

export function formatNumber(value: string | number | null | undefined, maximumFractionDigits = 3) {
  if (value === null || value === undefined || value === '') return '—'
  return new Intl.NumberFormat(undefined, { maximumFractionDigits }).format(Number(value))
}

export function displayName(value: string | null | undefined) {
  return (value || '—').replaceAll('_', ' ').toLocaleLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())
}