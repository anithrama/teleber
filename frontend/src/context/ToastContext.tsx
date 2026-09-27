import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { CircleCheck, CircleX, Info, X } from 'lucide-react'

type ToastTone = 'success' | 'error' | 'info'
type Toast = { id: number; message: string; tone: ToastTone }
type ToastContextValue = { notify: (message: string, tone?: ToastTone) => void }

const ToastContext = createContext<ToastContextValue | null>(null)
let nextToastId = 0

const icons = { success: CircleCheck, error: CircleX, info: Info }

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  function notify(message: string, tone: ToastTone = 'success') {
    const id = ++nextToastId
    setToasts((current) => [...current, { id, message, tone }])
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 4200)
  }

  useEffect(() => {
    const handleApiError = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail
      if (detail?.message) notify(detail.message, 'error')
    }
    window.addEventListener('api:error', handleApiError)
    return () => window.removeEventListener('api:error', handleApiError)
  }, [])

  return (
    <ToastContext.Provider value={{ notify }}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((toast) => {
          const Icon = icons[toast.tone]
          return <div className={`toast toast--${toast.tone}`} key={toast.id}>
            <Icon size={18} />
            <span>{toast.message}</span>
            <button className="icon-button toast__close" aria-label="Dismiss notification" onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}><X size={15} /></button>
          </div>
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const value = useContext(ToastContext)
  if (!value) throw new Error('useToast must be used inside ToastProvider')
  return value
}