import { useState } from 'react'
import {
  ArrowRight,
  BadgeCheck,
  Check,
  Fingerprint,
  LockKeyhole,
  Menu,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react'
import './App.css'
import { api } from './lib/api.js'

function App() {
  const [certificateId, setCertificateId] = useState('')
  const [verification, setVerification] = useState('idle')
  const [verificationResult, setVerificationResult] = useState(null)
  const [verificationError, setVerificationError] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)

  async function verifyCertificate(event) {
    event.preventDefault()
    if (!certificateId.trim()) return
    setVerification('loading')
    setVerificationError('')
    setVerificationResult(null)
    try {
      const result = await api(`/public/certificates/${encodeURIComponent(certificateId.trim())}/verify`)
      setVerificationResult(result)
      setVerification(result.verified ? 'verified' : 'unverified')
    } catch (error) {
      setVerificationError(error.message)
      setVerification('error')
    }
  }

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="CredChain home">
          <span className="brand-mark"><ShieldCheck size={20} strokeWidth={2.4} /></span>
          <span>credchain</span>
        </a>
        <button
          className="menu-toggle"
          type="button"
          aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <nav className={menuOpen ? 'main-nav is-open' : 'main-nav'} aria-label="Main navigation">
          <a href="#platform" onClick={() => setMenuOpen(false)}>Platform</a>
          <a href="#how-it-works" onClick={() => setMenuOpen(false)}>How it works</a>
          <a href="/login" onClick={() => setMenuOpen(false)}>For institutions</a>
        </nav>
        <div className="header-actions"><a className="header-signin" href="/login">Sign in</a><a className="header-cta" href="/register">Get started <ArrowRight size={15} /></a></div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="eyebrow"><span className="status-dot" /> TRUST, PROVEN ON-CHAIN</div>
          <h1>Every achievement.<br /><span>Beyond doubt.</span></h1>
          <p className="hero-description">Credentials deserve more than a line on a resume. CredChain makes every certificate instantly verifiable, permanently yours, and impossible to fake.</p>
          <div className="hero-actions">
            <a className="button button-primary" href="#verify">Verify a certificate <ArrowRight size={16} /></a>
            <a className="text-link" href="#how-it-works">See how it works <span className="play-icon">▶</span></a>
          </div>
          <div className="hero-proof">
            <div className="avatar-stack" aria-hidden="true"><span>JM</span><span>AL</span><span>SK</span><span>+</span></div>
            <p><strong>Trusted by 180+ institutions</strong><br />and the people they empower</p>
          </div>
        </div>
        <div className="hero-visual" aria-label="Graduate celebrating with a diploma">
          <img src="https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=1400&q=85" alt="University graduates celebrating together" />
          <div className="visual-wash" />
          <div className="image-caption"><span>01 / 03</span><span>Proof that moves with you</span></div>
          <div className="credential-card">
            <div className="credential-top"><span className="credential-brand"><span className="mini-mark"><ShieldCheck size={12} /></span> CREDCHAIN</span><span className="verified-pill"><Check size={11} /> VERIFIED</span></div>
            <div className="credential-rule" />
            <span className="credential-label">CERTIFICATE OF ACHIEVEMENT</span>
            <strong className="credential-name">Maya Johnson</strong>
            <span className="credential-course">Data Science Professional</span>
            <div className="credential-bottom"><span>Northstar Institute<br /><small>Issued May 18, 2025</small></span><span className="seal"><BadgeCheck size={25} /></span></div>
          </div>
          <div className="floating-verified"><span><BadgeCheck size={17} /></span><div><strong>Authenticity confirmed</strong><small>Secured on the blockchain</small></div></div>
        </div>
      </section>

      <section className="metrics" aria-label="CredChain platform metrics">
        <div><strong>2.4M<span>+</span></strong><small>Credentials secured</small></div>
        <div><strong>180<span>+</span></strong><small>Partner institutions</small></div>
        <div><strong>8 sec</strong><small>Average verification</small></div>
        <div className="metrics-note"><span className="metrics-pulse" /> A more trustworthy world of work, one credential at a time.</div>
      </section>

      <section className="verify-section" id="verify">
        <div className="verify-heading">
          <span className="section-kicker">THE PROOF IS IN YOUR HANDS</span>
          <h2>Got a credential?<br /><span>Let’s check it.</span></h2>
          <p>Paste a certificate ID and our AI will verify its issuer, integrity, and blockchain record in seconds.</p>
          <a className="verify-more" href="#how-it-works">Learn about verification <ArrowRight size={15} /></a>
        </div>
        <div className="verify-panel">
          <div className="panel-topline"><span><span className="panel-live" /> LIVE VERIFICATION</span><span className="panel-lock"><LockKeyhole size={13} /> END-TO-END SECURE</span></div>
          <form className="verify-form" onSubmit={verifyCertificate}>
            <label htmlFor="certificate-id">CERTIFICATE ID</label>
            <div className="input-row">
              <Fingerprint size={18} />
              <input id="certificate-id" value={certificateId} onChange={(event) => { setCertificateId(event.target.value); setVerification('idle'); setVerificationResult(null); setVerificationError('') }} placeholder="e.g. CC-2025-8F2A91" required maxLength={80} />
              <button type="submit" aria-label="Verify certificate" disabled={verification === 'loading'}><Search size={18} /></button>
            </div>
          </form>
          {verification === 'verified' ? (
            <div className="verification-result" role="status"><span className="result-icon"><Check size={17} /></span><div><strong>Credential verified</strong><small>Issuer and blockchain hash match.</small></div><BadgeCheck className="result-badge" size={23} /></div>
          ) : verification === 'unverified' ? (
            <div className="verification-result verification-failed" role="status"><span className="result-icon"><X size={17} /></span><div><strong>{verificationResult?.status === 'REVOKED' ? 'Credential revoked' : 'Credential not verified'}</strong><small>{verificationResult?.status === 'REVOKED' ? 'The issuer has revoked this credential.' : 'The issuer record and blockchain proof did not match.'}</small></div></div>
          ) : verification === 'error' ? (
            <div className="verification-result verification-failed" role="alert"><span className="result-icon"><X size={17} /></span><div><strong>Couldn’t verify this ID</strong><small>{verificationError}</small></div></div>
          ) : verification === 'loading' ? (
            <div className="verification-hint" role="status"><span className="loading-mark loading-mark-small" /> Checking public record…</div>
          ) : (
            <div className="verification-hint"><Sparkles size={15} /><span>AI-powered checks across issuer, metadata &amp; chain record</span></div>
          )}
          <div className="chain-proof"><span className="chain-icon"><LockKeyhole size={15} /></span><span>Every check leaves a transparent, tamper-proof trail.</span><span className="chain-arrow"><ArrowRight size={15} /></span></div>
        </div>
      </section>

      <section className="how-section" id="how-it-works">
        <div className="how-heading"><span className="section-kicker">A BETTER KIND OF PROOF</span><h2>From earned to <span>verified.</span></h2><p>Credentials should be as easy to trust as they are to share.</p></div>
        <div className="steps">
          <article className="step"><span className="step-number">01</span><span className="step-icon"><BadgeCheck size={20} /></span><h3>Earn it</h3><p>Your institution issues a digitally signed credential, anchored to a public blockchain.</p></article>
          <span className="step-connector"><ArrowRight size={17} /></span>
          <article className="step"><span className="step-number">02</span><span className="step-icon step-icon-lime"><Sparkles size={20} /></span><h3>Own it</h3><p>Your credential lives in your wallet, ready to share wherever your next step takes you.</p></article>
          <span className="step-connector"><ArrowRight size={17} /></span>
          <article className="step"><span className="step-number">03</span><span className="step-icon step-icon-coral"><Check size={20} /></span><h3>Prove it</h3><p>Anyone can verify its authenticity in seconds, without calling, chasing, or guessing.</p></article>
        </div>
      </section>

      <section className="trust-band" id="trust"><div className="trust-symbol"><ShieldCheck size={24} /></div><div><span className="section-kicker">BUILT FOR TRUST, BY DESIGN</span><h2>AI speed. Blockchain certainty.</h2></div><p>Intelligent fraud detection meets a permanent, public record. Your achievements stay yours. Their authenticity stays undeniable.</p><a className="trust-link" href="#verify" aria-label="Verify a credential"><ArrowRight size={19} /></a></section>

      <footer className="site-footer"><a className="brand footer-brand" href="#top"><span className="brand-mark"><ShieldCheck size={18} strokeWidth={2.4} /></span><span>credchain</span></a><span className="footer-note">Credentials you can count on.</span><div className="footer-links"><a href="#platform">Privacy</a><a href="#platform">Terms</a><a href="#platform">Contact</a></div><span className="copyright">© 2025 CredChain</span></footer>
    </main>
  )
}

export default App
