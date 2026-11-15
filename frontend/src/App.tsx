import React, { useEffect, useState } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'

import { ToastProvider } from './shared/components/Toast'
import { AuthProvider } from './shared/app/AuthContext'
import { AppArea } from './routes/AppArea'
import {
  ConfirmSentRoute,
  ConfirmTokenRoute,
  ErrorRoute,
  ForgotRoute,
  InviteRoute,
  LandingRoute,
  LoginRoute,
  RegisterRoute,
  ResetRoute,
} from './routes/PublicRoutes'

type Theme = 'light' | 'dark'

export default function App() {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('pz_theme') as Theme) || 'light')
  useEffect(() => localStorage.setItem('pz_theme', theme), [theme])

  return (
    <ToastProvider>
      <div className={theme === 'dark' ? 'dark' : ''}>
        <div className="min-h-screen bg-bg text-fg">
          <BrowserRouter>
            <AuthProvider>
              <Routes>
                <Route path="/" element={<LandingRoute />} />
                <Route path="/login" element={<LoginRoute />} />
                <Route path="/register" element={<RegisterRoute />} />
                <Route path="/forgot-password" element={<ForgotRoute />} />
                <Route path="/reset-password/:token" element={<ResetRoute />} />
                <Route path="/invite/:token" element={<InviteRoute />} />
                <Route path="/confirm" element={<ConfirmSentRoute />} />
                <Route path="/confirm/:token" element={<ConfirmTokenRoute />} />
                <Route path="/403" element={<ErrorRoute code="403" />} />
                {["/app/*", "/admin/*"].map((path) => (
                  <Route key={path} path={path} element={<AppArea theme={theme} onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))} />} />
                ))}
                <Route path="*" element={<ErrorRoute code="404" />} />
              </Routes>
            </AuthProvider>
          </BrowserRouter>
        </div>
      </div>
    </ToastProvider>
  )
}
