import axios from 'axios'
import { create } from 'zustand'

interface ApiState {
  baseURL: string
  token?: string
  get: <T = unknown>(path: string) => Promise<T>
  setToken: (t?: string) => void
}

export const useApi = create<ApiState>((set, get) => {
  const client = axios.create({
    baseURL: import.meta.env.VITE_API_BASE || 'http://localhost:5050/api',
    timeout: 15000,
  })

  client.interceptors.request.use((config) => {
    const token = get().token ?? import.meta.env.VITE_GITHUB_TOKEN
    if (token) {
      config.headers = config.headers ?? {}
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  })

  return {
    baseURL: client.defaults.baseURL!,
    token: undefined,
    setToken: (t) => set({ token: t }),
    get: async <T>(path: string) => {
      const res = await client.get<T>(path)
      return res.data
    },
  }
})
