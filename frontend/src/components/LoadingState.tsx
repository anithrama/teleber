import { LoaderCircle } from 'lucide-react'

export function LoadingState({ label = 'Loading records' }: { label?: string }) {
  return <div className="loading-state" role="status"><LoaderCircle className="spin" size={20} /><span>{label}</span></div>
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div className="error-state" role="alert">
    <strong>We couldn't load this information.</strong>
    <span>{message}</span>
    {onRetry && <button className="button button--secondary button--small" onClick={onRetry}>Try again</button>}
  </div>
}