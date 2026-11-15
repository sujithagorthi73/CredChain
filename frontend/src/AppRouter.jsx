import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext.jsx'
import { RequireAuth } from './auth/RequireAuth.jsx'
import App from './App.jsx'
import { LoginPage, RegisterPage } from './pages/AuthPages.jsx'
import { IssuerDashboard } from './pages/IssuerDashboard.jsx'
import { PublicVerification } from './pages/PublicVerification.jsx'
import { StudentDashboard } from './pages/StudentDashboard.jsx'

export default function AppRouter() {
  return <BrowserRouter><AuthProvider><Routes>
    <Route path="/" element={<App />} />
    <Route path="/login" element={<LoginPage />} />
    <Route path="/register" element={<RegisterPage />} />
    <Route path="/student" element={<RequireAuth roles={['STUDENT']}><StudentDashboard /></RequireAuth>} />
    <Route path="/issuer" element={<RequireAuth roles={['ISSUER', 'ADMIN']}><IssuerDashboard /></RequireAuth>} />
    <Route path="/verify/:publicId" element={<PublicVerification />} />
    <Route path="*" element={<App />} />
  </Routes></AuthProvider></BrowserRouter>
}