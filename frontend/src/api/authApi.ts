import { api, tokens, unwrap } from './client'

export type UserRole = 'ADMIN' | 'PURCHASE_MANAGER' | 'PURCHASE_USER' | 'WAREHOUSE_MANAGER' | 'ACCOUNTS_USER' | 'VIEWER'
export type User = { id: number; username: string; first_name: string; last_name: string; email: string; role: UserRole }
export type TokenPair = { access: string; refresh: string }

export const authApi = {
  async login(username: string, password: string) {
    const response = await api.post('auth/login/', { username, password })
    const pair = unwrap<TokenPair>(response)
    tokens.save(pair.access, pair.refresh)
    return pair
  },
  async me() {
    return unwrap<User>(await api.get('auth/me/'))
  },
  logout() {
    tokens.clear()
  },
}