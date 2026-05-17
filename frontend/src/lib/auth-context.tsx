"use client"

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react"
import { useRouter } from "next/navigation"

interface User {
  email: string
  name: string
  role: string
}

interface AuthContextType {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<boolean>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

const STORAGE_KEY = "oceanic-predict-user"

function getStoredUser(): User | null {
  if (typeof window === "undefined") return null
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY)
    return stored ? (JSON.parse(stored) as User) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  // Restore user session from sessionStorage on mount
  useEffect(() => {
    const stored = getStoredUser()
    if (stored) {
      setUser(stored)
    }
    setIsLoading(false)
  }, [])

  const login = useCallback(
    async (email: string, _password: string): Promise<boolean> => {
      // Demo authentication - replace with real API call
      if (email && _password.length >= 4) {
        const newUser: User = {
          email,
          name: email.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
          role: "Administrador",
        }
        setUser(newUser)
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(newUser))
        return true
      }
      return false
    },
    [],
  )

  const logout = useCallback(() => {
    setUser(null)
    sessionStorage.removeItem(STORAGE_KEY)
    router.push("/login")
  }, [router])

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
