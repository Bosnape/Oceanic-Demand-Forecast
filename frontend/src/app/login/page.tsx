"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { Activity, Eye, EyeOff, Mail, Lock, ArrowRight } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const { login, isAuthenticated, isLoading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace("/dashboard")
    }
  }, [isAuthenticated, isLoading, router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const success = await login(email, password)
      if (success) {
        router.replace("/dashboard")
      } else {
        setError("Credenciales inválidas. Intente de nuevo.")
      }
    } catch {
      setError("Error al iniciar sesión. Intente de nuevo.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div
        className="flex w-full overflow-hidden rounded-2xl shadow-xl"
        style={{ maxWidth: "1040px" }}
      >
        {/* ── HERO PANEL ── */}
        <div
          className="relative hidden flex-col gap-6 overflow-hidden p-9 lg:flex"
          style={{
            background: "var(--sidebar)",
            color: "white",
            flex: "1.15",
          }}
        >
          {/* Blueprint grid */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                "linear-gradient(oklch(1 0 0 / 0.04) 1px, transparent 1px), linear-gradient(90deg, oklch(1 0 0 / 0.04) 1px, transparent 1px)",
              backgroundSize: "32px 32px",
            }}
          />
          {/* Emerald glow orb */}
          <div
            className="pointer-events-none absolute"
            style={{
              width: 380,
              height: 380,
              right: -120,
              top: -80,
              background:
                "radial-gradient(circle, oklch(0.65 0.19 165 / 0.35) 0%, transparent 65%)",
            }}
          />

          {/* Content above the fold */}
          <div className="relative z-10 flex items-center gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
              style={{
                background:
                  "linear-gradient(135deg, oklch(0.65 0.19 165), oklch(0.55 0.20 250))",
                boxShadow: "0 8px 24px -6px oklch(0.65 0.19 165 / 0.5)",
              }}
            >
              <Activity className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="text-sm font-semibold tracking-tight" style={{ fontFamily: "var(--font-heading)" }}>
                Oceanic Predict
              </div>
              <div className="text-[11px]" style={{ color: "oklch(1 0 0 / 0.55)" }}>
                Analytics MVP · v0.4.2
              </div>
            </div>
          </div>

          {/* Hero heading */}
          <div className="relative z-10">
            <h1
              className="text-[30px] font-bold leading-[1.1] tracking-tight"
              style={{ fontFamily: "var(--font-heading)", textWrap: "balance" }}
            >
              Datos operativos en{" "}
              <em
                className="not-italic"
                style={{
                  background:
                    "linear-gradient(90deg, oklch(0.78 0.16 165), oklch(0.70 0.18 230))",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                decisiones estratégicas
              </em>
              .
            </h1>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: "oklch(1 0 0 / 0.72)", maxWidth: "38ch" }}>
              Predicción de demanda, optimización de inventarios y proyección de
              flujo de caja impulsados por Machine Learning.
            </p>
          </div>

          {/* Mini live dashboard card */}
          <div
            className="relative z-10 flex flex-col gap-3 rounded-2xl p-4"
            style={{
              background: "oklch(1 0 0 / 0.04)",
              border: "1px solid oklch(1 0 0 / 0.08)",
              backdropFilter: "blur(8px)",
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-medium" style={{ color: "oklch(1 0 0 / 0.85)" }}>
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{
                    background: "oklch(0.65 0.19 165)",
                    boxShadow: "0 0 0 3px oklch(0.65 0.19 165 / 0.25)",
                    animation: "livedot 1.6s ease-in-out infinite",
                  }}
                />
                Pronóstico · 90 días
              </div>
              <span
                className="font-mono text-[10px] uppercase tracking-widest"
                style={{ color: "oklch(1 0 0 / 0.5)" }}
              >
                en vivo
              </span>
            </div>

            {/* KPI stats */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "MAPE", value: "8.2%", delta: "▲ +1.4 pp", up: true },
                { label: "Demanda", value: "+18%", delta: "▲ vs Q3", up: true },
                { label: "Stockout", value: "3", delta: "▼ -5 SKUs", up: false },
              ].map((s) => (
                <div key={s.label} className="flex flex-col gap-0.5">
                  <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "oklch(1 0 0 / 0.45)" }}>
                    {s.label}
                  </span>
                  <span className="text-lg font-bold tabular-nums tracking-tight">{s.value}</span>
                  <span
                    className="text-[10px] font-medium"
                    style={{ color: s.up ? "oklch(0.78 0.16 165)" : "oklch(0.70 0.18 30)" }}
                  >
                    {s.delta}
                  </span>
                </div>
              ))}
            </div>

            {/* Area chart SVG */}
            <svg viewBox="0 0 320 100" preserveAspectRatio="none" className="w-full" style={{ height: 100 }}>
              <defs>
                <linearGradient id="lgA" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="oklch(0.78 0.14 230)" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="oklch(0.78 0.14 230)" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="lgB" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="oklch(0.65 0.19 165)" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="oklch(0.65 0.19 165)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <g stroke="oklch(1 0 0 / 0.06)" strokeDasharray="2 4">
                <line x1="0" y1="20" x2="320" y2="20" />
                <line x1="0" y1="50" x2="320" y2="50" />
                <line x1="0" y1="80" x2="320" y2="80" />
              </g>
              <path d="M0,70 L40,55 L80,62 L120,38 L160,48 L200,30 L200,90 L0,90 Z" fill="url(#lgA)" />
              <path d="M0,70 L40,55 L80,62 L120,38 L160,48 L200,30" stroke="oklch(0.78 0.14 230)" strokeWidth="1.8" fill="none" />
              <path d="M200,30 L240,42 L280,28 L320,35 L320,90 L200,90 Z" fill="url(#lgB)" opacity="0.85" />
              <path d="M200,30 L240,42 L280,28 L320,35" stroke="oklch(0.78 0.16 165)" strokeWidth="1.8" strokeDasharray="4 3" fill="none" />
              <line x1="200" y1="10" x2="200" y2="90" stroke="oklch(1 0 0 / 0.15)" strokeDasharray="2 3" />
              <text x="204" y="16" fontSize="8" fill="oklch(1 0 0 / 0.55)" fontFamily="ui-monospace,monospace">HOY</text>
              <circle cx="200" cy="30" r="3" fill="oklch(0.78 0.14 230)" />
              <circle cx="280" cy="28" r="3" fill="oklch(0.78 0.16 165)" />
            </svg>

            {/* Bar strips */}
            <div className="flex flex-col gap-1">
              <div className="flex items-end gap-1.5" style={{ height: 44, padding: "0 2px" }}>
                {[38, 62, 48, 80, 55, 92, 72, 88, 76, 95].map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-t-sm"
                    style={{
                      height: `${h}%`,
                      background:
                        i >= 6
                          ? "linear-gradient(to top, oklch(0.65 0.19 165), oklch(0.78 0.16 165))"
                          : "linear-gradient(to top, oklch(0.55 0.20 250), oklch(0.70 0.18 230))",
                    }}
                  />
                ))}
              </div>
              <div className="flex gap-1.5 px-0.5">
                {["S1","S2","S3","S4","S5","S6","S7","S8","S9","S10"].map((l) => (
                  <span key={l} className="flex-1 text-center font-mono text-[9px]" style={{ color: "oklch(1 0 0 / 0.35)" }}>
                    {l}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Metric chips */}
          <div className="relative z-10 flex flex-wrap gap-2">
            {[
              { value: "+18%", label: "margen", color: "oklch(0.78 0.16 165)" },
              { value: "92%", label: "precisión", color: "oklch(0.78 0.14 230)" },
              { value: "$184K", label: "capital liberado", color: "oklch(0.78 0.16 30)" },
            ].map((c) => (
              <div
                key={c.label}
                className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs"
                style={{
                  background: "oklch(1 0 0 / 0.06)",
                  border: "1px solid oklch(1 0 0 / 0.1)",
                }}
              >
                <strong className="font-bold tabular-nums tracking-tight" style={{ color: c.color }}>
                  {c.value}
                </strong>
                <span style={{ color: "oklch(1 0 0 / 0.6)" }}>{c.label}</span>
              </div>
            ))}
          </div>

          <style>{`
            @keyframes livedot {
              0%, 100% { opacity: 1; }
              50% { opacity: 0.4; }
            }
          `}</style>
        </div>

        {/* ── FORM PANEL ── */}
        <div
          className="relative flex w-full flex-col justify-center bg-card lg:w-auto"
          style={{ flex: 1, minWidth: 0 }}
        >
          {/* Gradient top bar */}
          <div
            className="absolute left-0 right-0 top-0 h-1"
            style={{
              background:
                "linear-gradient(90deg, oklch(0.55 0.20 250), oklch(0.65 0.19 165), oklch(0.70 0.15 50))",
            }}
          />

          <div className="mx-auto w-full max-w-sm px-8 py-12">
            {/* Mobile logo */}
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Activity className="h-6 w-6" />
              </div>
              <span className="text-xl font-semibold tracking-tight text-foreground">Oceanic Predict</span>
            </div>

            <div className="mb-6">
              <span
                className="font-mono text-[10px] font-semibold uppercase tracking-widest"
                style={{ color: "var(--primary)" }}
              >
                › Acceso seguro
              </span>
              <h2
                className="mt-1 text-[26px] font-bold leading-tight tracking-tight text-foreground"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                Iniciar Sesión
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Ingrese sus credenciales para acceder al panel de control.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              {error && (
                <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email" className="text-[13px] font-medium text-foreground">
                  Correo Electrónico
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="usuario@empresa.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="pl-9 pr-4"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password" className="text-[13px] font-medium text-foreground">
                  Contraseña
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="pl-9 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="mt-1 flex h-11 w-full items-center justify-center gap-2 rounded-lg text-sm font-semibold text-white transition-transform hover:-translate-y-px disabled:opacity-70"
                style={{
                  background: loading
                    ? "var(--primary)"
                    : "linear-gradient(135deg, var(--primary), oklch(0.55 0.18 240))",
                  boxShadow: "0 8px 20px -8px oklch(0.45 0.18 250 / 0.6)",
                }}
              >
                {loading ? "Ingresando..." : "Ingresar al Dashboard"}
                {!loading && <ArrowRight className="h-4 w-4" />}
              </button>

              <p className="text-center text-xs text-muted-foreground">
                ¿No tiene cuenta?{" "}
                <a href="#" className="font-semibold text-primary hover:underline">
                  Solicite acceso
                </a>
              </p>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
