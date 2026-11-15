import { useState } from 'react'
import { ArrowLeft, ArrowRight, ShieldCheck } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth.js'

function dashboardFor(user) {
  return user.role === 'STUDENT' ? '/student' : '/issuer'
}

function AuthFrame({ eyebrow, title, description, children, alternate }) {
  return (
    <main className="auth-layout">
      <section className="auth-story">
        <Link to="/" className="brand auth-brand"><span className="brand-mark"><ShieldCheck size={20} /></span><span>credchain</span></Link>
        <div className="auth-story-copy"><span className="section-kicker">{eyebrow}</span><h1>Proof that<br /><span>moves with you.</span></h1><p>One secure home for credentials you’ve earned and trust you’ve built.</p></div>
        <span className="auth-story-foot">PRIVATE BY DESIGN · VERIFIED BY THE CHAIN</span>
      </section>
      <section className="auth-form-side">
        <Link to="/" className="back-link"><ArrowLeft size={15} /> Back to CredChain</Link>
        <div className="auth-form-wrap"><span className="section-kicker">{eyebrow}</span><h2>{title}</h2><p className="auth-description">{description}</p>{children}<p className="auth-alternate">{alternate}</p></div>
      </section>
    </main>
  )
}

export function LoginPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const user = await signIn({ email: event.currentTarget.email.value, password: event.currentTarget.password.value })
      navigate(dashboardFor(user), { replace: true })
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  return <AuthFrame eyebrow="YOUR CREDENTIAL WALLET" title="Welcome back." description="Sign in to manage, share, and verify your credentials." alternate={<>New to CredChain? <Link to="/register">Create your account <ArrowRight size={13} /></Link></>}>
    <form className="account-form" onSubmit={submit}>
      <label htmlFor="email">Email address</label><input id="email" name="email" type="email" autoComplete="email" required maxLength={254} />
      <label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" required maxLength={128} />
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button button-primary form-submit" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'} <ArrowRight size={16} /></button>
    </form>
  </AuthFrame>
}

export function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const user = await register({ fullName: event.currentTarget.fullName.value, email: event.currentTarget.email.value, password: event.currentTarget.password.value })
      navigate(dashboardFor(user), { replace: true })
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  return <AuthFrame eyebrow="START WITH WHAT YOU’VE EARNED" title="Your next step starts here." description="Create your student account and keep every achievement ready to prove." alternate={<>Already have an account? <Link to="/login">Sign in <ArrowRight size={13} /></Link></>}>
    <form className="account-form" onSubmit={submit}>
      <label htmlFor="fullName">Full name</label><input id="fullName" name="fullName" autoComplete="name" required minLength={2} maxLength={120} />
      <label htmlFor="email">Email address</label><input id="email" name="email" type="email" autoComplete="email" required maxLength={254} />
      <label htmlFor="password">Password <span>12 characters minimum</span></label><input id="password" name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} />
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button button-primary form-submit" type="submit" disabled={busy}>{busy ? 'Creating account…' : 'Create student account'} <ArrowRight size={16} /></button>
    </form>
  </AuthFrame>
}