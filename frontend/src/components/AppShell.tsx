import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Archive, BarChart3, Boxes, ClipboardList, FileCheck2, FilePlus2, FileText,
  LayoutDashboard, LogOut, Menu, PackageCheck, PackageSearch,
  ReceiptText, Scale, Users, X,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import type { UserRole } from '../api/authApi'

type NavItem = { label: string; to: string; icon: typeof LayoutDashboard; roles: UserRole[] }
const allRoles: UserRole[] = ['ADMIN', 'PURCHASE_MANAGER', 'PURCHASE_USER', 'WAREHOUSE_MANAGER', 'ACCOUNTS_USER', 'VIEWER']
const buyingRoles: UserRole[] = ['ADMIN', 'PURCHASE_MANAGER', 'PURCHASE_USER', 'VIEWER']
const managerRoles: UserRole[] = ['ADMIN', 'PURCHASE_MANAGER']

const navigation: { group: string; items: NavItem[] }[] = [
  { group: 'Overview', items: [
    { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard, roles: allRoles },
    { label: 'Reports', to: '/reports', icon: BarChart3, roles: managerRoles },
  ] },
  { group: 'Buying', items: [
    { label: 'Suppliers', to: '/suppliers', icon: Users, roles: buyingRoles },
    { label: 'Items', to: '/items', icon: Boxes, roles: buyingRoles },
    { label: 'Material requests', to: '/material-requests', icon: ClipboardList, roles: buyingRoles },
    { label: 'Quotations', to: '/quotations', icon: FileText, roles: buyingRoles },
    { label: 'Compare offers', to: '/quotations/compare', icon: Scale, roles: buyingRoles },
    { label: 'Purchase orders', to: '/purchase-orders', icon: FileCheck2, roles: buyingRoles },
    { label: 'Approvals', to: '/approvals', icon: FilePlus2, roles: managerRoles },
  ] },
  { group: 'Operations', items: [
    { label: 'Receipts', to: '/purchase-receipts', icon: PackageCheck, roles: ['ADMIN', 'WAREHOUSE_MANAGER', 'VIEWER'] },
    { label: 'Inventory', to: '/inventory', icon: Archive, roles: ['ADMIN', 'WAREHOUSE_MANAGER', 'VIEWER'] },
    { label: 'Invoices', to: '/invoices', icon: ReceiptText, roles: ['ADMIN', 'ACCOUNTS_USER', 'VIEWER'] },
  ] },
]

const titles: Record<string, string> = {
  '/dashboard': 'Dashboard', '/reports': 'Procurement reports', '/suppliers': 'Suppliers', '/items': 'Items',
  '/material-requests': 'Material requests', '/quotations': 'Supplier quotations', '/quotations/compare': 'Quotation comparison',
  '/purchase-orders': 'Purchase orders', '/approvals': 'Purchase approvals', '/purchase-receipts': 'Purchase receipts',
  '/inventory': 'Inventory', '/invoices': 'Purchase invoices',
}

export function AppShell() {
  const { user, logout } = useAuth()
  const { notify } = useToast()
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const heading = Object.entries(titles).sort((a, b) => b[0].length - a[0].length).find(([path]) => location.pathname.startsWith(path))?.[1] || 'Procurement'

  function signOut() {
    logout()
    notify('You have been signed out.', 'info')
    navigate('/login')
  }

  return <div className="app-frame">
    {mobileOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
    <aside className={`sidebar ${mobileOpen ? 'sidebar--open' : ''}`}>
      <div className="brand"><span className="brand__mark"><PackageSearch size={21} /></span><span>Northstar<span className="brand__sub">PROCUREMENT</span></span><button className="icon-button sidebar__mobile-close" aria-label="Close navigation" onClick={() => setMobileOpen(false)}><X size={18} /></button></div>
      <div className="org-switcher"><span className="org-switcher__dot" /><span>Operations group</span><span className="org-switcher__caret">⌄</span></div>
      <nav className="sidebar-nav" aria-label="Main navigation">
        {navigation.map((section) => {
          const items = section.items.filter((item) => item.roles.includes(user?.role || 'VIEWER'))
          if (!items.length) return null
          return <div className="nav-section" key={section.group}>
            <div className="nav-section__label">{section.group}</div>
            {items.map(({ label, to, icon: Icon }) => <NavLink key={to} to={to} end={to !== '/quotations'} className={({ isActive }) => `nav-link ${isActive ? 'nav-link--active' : ''}`} onClick={() => setMobileOpen(false)}>
              <Icon size={18} strokeWidth={1.8} /><span>{label}</span>
            </NavLink>)}
          </div>
        })}
      </nav>
      <div className="sidebar__footer"><div className="profile-mark">{(user?.first_name || user?.username || 'U').slice(0, 1).toUpperCase()}</div><div className="profile-copy"><strong>{user?.first_name || user?.username}</strong><span>{user?.role?.replaceAll('_', ' ')}</span></div><button className="icon-button signout-button" title="Sign out" aria-label="Sign out" onClick={signOut}><LogOut size={17} /></button></div>
    </aside>
    <div className="workspace">
      <header className="topbar"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Menu size={20} /></button><div className="breadcrumb"><span>Buying</span><span className="breadcrumb__divider">/</span><strong>{heading}</strong></div><div className="topbar__right"><span className="connection-pill"><span /> API connected</span><button className="topbar__user" onClick={signOut} title="Sign out"><span className="profile-mark profile-mark--small">{(user?.first_name || user?.username || 'U').slice(0, 1).toUpperCase()}</span><span>{user?.first_name || user?.username}</span><LogOut size={15} /></button></div></header>
      <main className="page-content"><Outlet /></main>
    </div>
  </div>
}

export function hasRole(role: UserRole | undefined, allowed: UserRole[]) {
  return Boolean(role && allowed.includes(role))
}