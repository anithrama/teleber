import axios, { type AxiosError, type AxiosRequestConfig, type AxiosResponse } from 'axios'

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api/'
export const apiBaseUrl = configuredBaseUrl.endsWith('/') ? configuredBaseUrl : `${configuredBaseUrl}/`

const accessKey = 'procure.access'
const refreshKey = 'procure.refresh'

export type ApiEnvelope<T> = {
  success: boolean
  message: string
  data?: T
  errors?: Record<string, unknown>
}

type RetryConfig = AxiosRequestConfig & { _retry?: boolean }

export class ApiError extends Error {
  status?: number
  errors: Record<string, unknown>

  constructor(message: string, status?: number, errors: Record<string, unknown> = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.errors = errors
  }
}

export const tokens = {
  access: () => sessionStorage.getItem(accessKey),
  refresh: () => sessionStorage.getItem(refreshKey),
  save: (access: string, refresh?: string) => {
    sessionStorage.setItem(accessKey, access)
    if (refresh) sessionStorage.setItem(refreshKey, refresh)
  },
  clear: () => {
    sessionStorage.removeItem(accessKey)
    sessionStorage.removeItem(refreshKey)
  },
}

export const api = axios.create({
  baseURL: apiBaseUrl,
  headers: { 'Content-Type': 'application/json' },
})

export function unwrap<T>(response: { data: ApiEnvelope<T> | T }): T {
  const payload = response.data as ApiEnvelope<T>
  if (payload && typeof payload === 'object' && 'success' in payload && 'data' in payload) {
    return payload.data as T
  }
  return payload as T
}

function normalizeApiError(error: AxiosError<ApiEnvelope<unknown>>) {
  const payload = error.response?.data
  const message = payload?.message || (error.response ? 'The request could not be completed.' : 'The API could not be reached.')
  const normalized = new ApiError(message, error.response?.status, payload?.errors || {})
  return normalized
}

let refreshing: Promise<string> | null = null

api.interceptors.request.use((config) => {
  const access = tokens.access()
  if (access) config.headers.Authorization = `Bearer ${access}`
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiEnvelope<unknown>>) => {
    const original = error.config as RetryConfig | undefined
    const requestPath = original?.url || ''
    if (error.response?.status === 401 && original && !original._retry && !/auth\/(login|refresh)\//.test(requestPath)) {
      const refresh = tokens.refresh()
      if (refresh) {
        original._retry = true
        try {
          refreshing ||= axios.post<ApiEnvelope<{ access: string; refresh?: string }>>(
            `${apiBaseUrl}auth/refresh/`, { refresh },
          ).then((response) => {
            const result = unwrap(response)
            tokens.save(result.access, result.refresh)
            return result.access
          }).finally(() => { refreshing = null })
          const nextAccess = await refreshing
          original.headers = { ...original.headers, Authorization: `Bearer ${nextAccess}` }
          return api.request(original)
        } catch {
          tokens.clear()
          window.dispatchEvent(new CustomEvent('auth:expired'))
        }
      } else {
        tokens.clear()
        window.dispatchEvent(new CustomEvent('auth:expired'))
      }
    }
    return Promise.reject(normalizeApiError(error))
  },
)

export async function getAll<T>(path: string, params?: Record<string, string | number>): Promise<T[]> {
  type PageData = T[] | { results: T[]; next: string | null }
  const collected: T[] = []
  let next: string | null = path
  let firstRequest = true
  while (next) {
    const requestUrl: string = next
    const response: AxiosResponse<ApiEnvelope<PageData>> = await api.get<ApiEnvelope<PageData>>(
      requestUrl, { params: firstRequest ? params : undefined },
    )
    const page: PageData = unwrap<PageData>(response)
    if (Array.isArray(page)) return page
    collected.push(...(page.results || []))
    next = page.next
    firstRequest = false
  }
  return collected
}

export function apiErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Something went wrong. Please try again.'
  if (error.status === 400 || error.status === 422) {
    const details = Object.entries(error.errors)
      .flatMap(([field, value]) => {
        const messages = Array.isArray(value) ? value.map(String) : [String(value)]
        return messages.map((message) => `${field.replaceAll('_', ' ')}: ${message}`)
      })
      .join(' ')
    return details ? `Please correct the highlighted fields. ${details}` : error.message
  }
  if (error.status === 401) return 'Your session is invalid or has expired. Please sign in again.'
  if (error.status === 403) return 'You do not have permission to perform this action.'
  if (error.status === 404) return 'The requested record was not found.'
  if (error.status === 409) return 'This record conflicts with existing data.'
  return error.message
}

export function apiFieldErrors(error: unknown): Record<string, string[]> {
  if (!(error instanceof ApiError)) return {}
  return Object.fromEntries(Object.entries(error.errors).map(([key, value]) => [
    key,
    Array.isArray(value) ? value.map(String) : [String(value)],
  ]))
}