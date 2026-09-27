import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useNavigate } from 'react-router-dom'
import { ArrowLeft, ShieldAlert } from 'lucide-react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import { AppShell } from './components/AppShell'
import { Button } from './components/Primitives'
import { LoadingState } from './components/LoadingState'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { ResourceListPage, type ResourceKind } from './pages/ResourceListPage'
import { RecordFormPage } from './pages/RecordFormPage'
import { ResourceDetailPage } from './pages/ResourceDetailPage'
import { QuotationComparePage } from './pages/QuotationComparePage'
import { ApprovalsPage } from './pages/ApprovalsPage'
import { InventoryPage } from './pages/InventoryPage'
import { ReportsPage } from './pages/ReportsPage'
import type { UserRole } from './api/authApi'

const allRoles: UserRole[] = ['ADMIN', 'PURCHASE_MANAGER', 'PURCHASE_USER', 'WAREHOUSE_MANAGER', 'ACCOUNTS_USER', 'VIEWER']
const buyingRoles: UserRole[] = ['ADMIN', 'PURCHASE_MANAGER', 'PURCHASE_USER', 'VIEWER']
const buyerWriteRoles: UserRole[] = ['ADMIN', 'PURCHASE_MANAGER', 'PURCHASE_USER']
const warehouseRoles: UserRole[] = ['ADMIN', 'WAREHOUSE_MANAGER']
const accountingRoles: UserRole[] = ['ADMIN', 'ACCOUNTS_USER']
const invoiceReadRoles: UserRole[] = ['ADMIN', 'PURCHASE_MANAGER', 'ACCOUNTS_USER', 'VIEWER']

function RequireAuth() {
  const { user, loading } = useAuth()
  if (loading) return <LoadingState label="Checking session" />
  return user ? <Outlet /> : <Navigate to="/login" replace />
}

function RedirectLogin() {
  const { user, loading } = useAuth()
  if (loading) return <LoadingState label="Checking session" />
  return user ? <Navigate to="/dashboard" replace /> : <LoginPage />
}

function RoleGate({ roles, children }: { roles: UserRole[]; children: ReactNode }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  if (!user || roles.includes(user.role)) return children
  return <section className="access-denied"><span><ShieldAlert size={24} /></span><h1>Access restricted</h1><p>Your <strong>{user.role.replaceAll('_', ' ')}</strong> role cannot open this page. Frontend restrictions are for navigation only; Django remains the authority for all API access.</p><Button variant="secondary" onClick={() => navigate('/dashboard')}><ArrowLeft size={15} />Return to dashboard</Button></section>
}

function NotFound() {
  return <section className="access-denied"><span><ShieldAlert size={24} /></span><h1>Page not found</h1><p>This route is not part of the Buying and Procurement workspace.</p><Button variant="secondary" onClick={() => window.location.assign('/dashboard')}><ArrowLeft size={15} />Return to dashboard</Button></section>
}

const modules: { kind: ResourceKind; path: string; read: UserRole[]; write: UserRole[] }[] = [
  { kind: 'suppliers', path: 'suppliers', read: buyingRoles, write: buyerWriteRoles },
  { kind: 'items', path: 'items', read: buyingRoles, write: buyerWriteRoles },
  { kind: 'material-requests', path: 'material-requests', read: buyingRoles, write: buyerWriteRoles },
  { kind: 'quotations', path: 'quotations', read: buyingRoles, write: buyerWriteRoles },
  { kind: 'purchase-orders', path: 'purchase-orders', read: buyingRoles, write: buyerWriteRoles },
  { kind: 'purchase-receipts', path: 'purchase-receipts', read: [...warehouseRoles, 'VIEWER'], write: warehouseRoles },
  { kind: 'invoices', path: 'invoices', read: invoiceReadRoles, write: accountingRoles },
]

function WorkspaceRoutes() {
  return <Routes>
    <Route path="/login" element={<RedirectLogin />} />
    <Route element={<RequireAuth />}>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<RoleGate roles={allRoles}><DashboardPage /></RoleGate>} />
        <Route path="reports" element={<RoleGate roles={['ADMIN', 'PURCHASE_MANAGER']}><ReportsPage /></RoleGate>} />
        <Route path="approvals" element={<RoleGate roles={['ADMIN', 'PURCHASE_MANAGER']}><ApprovalsPage /></RoleGate>} />
        <Route path="inventory" element={<RoleGate roles={['ADMIN', 'WAREHOUSE_MANAGER', 'VIEWER']}><InventoryPage /></RoleGate>} />
        <Route path="quotations/compare" element={<RoleGate roles={buyingRoles}><QuotationComparePage /></RoleGate>} />
        {modules.map(({ kind, path, read, write }) => <Route path={path} key={path}>
          <Route index element={<RoleGate roles={read}><ResourceListPage kind={kind} /></RoleGate>} />
          <Route path="create" element={<RoleGate roles={write}><RecordFormPage kind={kind} /></RoleGate>} />
          {kind !== 'purchase-receipts' && <Route path=":id/edit" element={<RoleGate roles={write}><RecordFormPage kind={kind} /></RoleGate>} />}
          <Route path=":id" element={<RoleGate roles={read}><ResourceDetailPage kind={kind} /></RoleGate>} />
        </Route>)}
        <Route path="*" element={<NotFound />} />
      </Route>
    </Route>
    <Route path="*" element={<Navigate to="/login" replace />} />
  </Routes>
}

export default function App() {
  return <BrowserRouter><AuthProvider><ToastProvider><WorkspaceRoutes /></ToastProvider></AuthProvider></BrowserRouter>
}