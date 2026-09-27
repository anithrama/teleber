import { useState, type FormEvent } from 'react'
import { ArrowRight, Boxes, LoaderCircle, ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { apiErrorMessage } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { FormField, TextInput } from '../components/Primitives'

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await login(username.trim(), password)
      navigate('/dashboard', { replace: true })
    } catch (reason) {
      setError(apiErrorMessage(reason))
    } finally {
      setSubmitting(false)
    }
  }

  return <div className="login-screen">
    <aside className="login-aside">
      <div className="login-brand"><span className="brand__mark"><Boxes size={21} /></span><span>Northstar<span className="brand__sub">PROCUREMENT</span></span></div>
      <div className="login-copy"><span className="login-copy__eyebrow"><ShieldCheck size={14} /> Buying operations</span><h1>Good decisions start with a clear supply chain.</h1><p>One workspace for requests, supplier offers, purchasing approvals, receiving, and invoice matching.</p></div>
      <div className="login-aside__foot">Procurement workspace · Secure access</div>
    </aside>
    <main className="login-main"><form className="login-card" onSubmit={submit}>
      <h2>Sign in</h2><p className="login-card__intro">Use your procurement account to continue.</p>
      {error && <div className="form-error-summary" role="alert">{error}</div>}
      <FormField label="Username"><TextInput autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required autoFocus /></FormField>
      <FormField label="Password"><TextInput type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></FormField>
      <button className="button button--primary" disabled={submitting}>{submitting ? <LoaderCircle className="spin" size={17} /> : <>Continue <ArrowRight size={16} /></>}</button>
      <p className="login-help">Accounts are created and assigned a role by your administrator. Credentials are verified by the Django API.</p>
    </form></main>
  </div>
}