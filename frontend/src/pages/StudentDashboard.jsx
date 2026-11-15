import { useEffect, useState } from 'react'
import { ArrowRight, BadgeCheck, FileUp, LogOut, Plus, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/useAuth.js'
import { api } from '../lib/api.js'

const fields = [
  ['recipientName', 'Recipient name', 'text'],
  ['credentialTitle', 'Credential title', 'text'],
  ['issuingInstitution', 'Issuing institution', 'text'],
  ['issuedOn', 'Issue date', 'date'],
  ['expiresOn', 'Expiry date', 'date'],
  ['credentialId', 'Issuer credential ID', 'text'],
]

function emptyCredential() {
  return { recipientName: '', credentialTitle: '', issuingInstitution: '', issuedOn: '', expiresOn: null, credentialId: null, description: null }
}

function WorkspaceHeader({ user, signOut, eyebrow }) {
  return <header className="workspace-header"><Link to="/" className="brand"><span className="brand-mark"><ShieldCheck size={19} /></span><span>credchain</span></Link><span className="workspace-divider" /><div className="workspace-heading"><span className="section-kicker">{eyebrow}</span><strong>{user.fullName}</strong></div><button className="icon-action" type="button" onClick={signOut} title="Sign out" aria-label="Sign out"><LogOut size={17} /></button></header>
}

export function StudentDashboard() {
  const { token, user, signOut } = useAuth()
  const [dashboard, setDashboard] = useState({ counts: {}, certificates: [] })
  const [selected, setSelected] = useState(null)
  const [review, setReview] = useState(emptyCredential())
  const [file, setFile] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function loadDashboard() {
    const data = await api('/student/dashboard', { token })
    setDashboard(data)
  }

  useEffect(() => {
    let active = true
    api('/student/dashboard', { token }).then((data) => { if (active) setDashboard(data) }).catch((failure) => { if (active) setError(failure.message) })
    return () => { active = false }
  }, [token])

  async function uploadCertificate(event) {
    event.preventDefault()
    if (!file) return
    const form = event.currentTarget
    setBusy(true)
    setError('')
    setMessage('')
    const body = new FormData()
    body.append('file', file)
    try {
      const { certificate } = await api('/student/certificates', { token, method: 'POST', body })
      await loadDashboard()
      setSelected(certificate)
      setReview({ ...emptyCredential(), ...certificate.extractedData })
      setFile(null)
      form.reset()
      setMessage('Certificate uploaded. Review the extracted details before submitting.')
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  function selectDraft(certificate) {
    setSelected(certificate)
    setReview({ ...emptyCredential(), ...certificate.extractedData, ...certificate.reviewedData })
    setMessage('')
  }

  async function saveReview(event) {
    event.preventDefault()
    if (!selected) return
    setBusy(true)
    setError('')
    try {
      const details = { ...review, expiresOn: review.expiresOn || null, credentialId: review.credentialId || null, description: review.description || null }
      const { certificate } = await api(`/student/certificates/${selected.id}/review`, { token, method: 'PATCH', body: JSON.stringify(details) })
      setSelected(certificate)
      await loadDashboard()
      setMessage('Your reviewed details are saved.')
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  async function submitReview() {
    if (!selected) return
    setBusy(true)
    setError('')
    try {
      const { certificate } = await api(`/student/certificates/${selected.id}/submit`, { token, method: 'POST' })
      setSelected(null)
      await loadDashboard()
      setMessage(`Certificate ${certificate.publicId} submitted to an issuer.`)
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  return <main className="workspace-page"><WorkspaceHeader user={user} signOut={signOut} eyebrow="STUDENT WALLET" />
    <section className="workspace-main"><div className="workspace-title"><div><span className="section-kicker">YOUR ACHIEVEMENTS, IN ONE PLACE</span><h1>Credential wallet</h1><p>Upload, review, and share the proof you’ve earned.</p></div><span className="wallet-mark"><ShieldCheck size={24} /></span></div>
      <div className="stat-strip"><div><strong>{dashboard.counts.DRAFT || 0}</strong><span>Needs review</span></div><div><strong>{dashboard.counts.SUBMITTED || 0}</strong><span>Awaiting issuer</span></div><div><strong>{dashboard.counts.APPROVED || 0}</strong><span>Verified</span></div></div>
      {error && <p className="notice notice-error" role="alert">{error}</p>}{message && <p className="notice notice-success" role="status">{message}</p>}
      <div className="student-grid"><section className="workspace-panel upload-panel"><div className="panel-heading"><span className="section-kicker">ADD A CREDENTIAL</span><h2>Bring your achievement in.</h2></div><form className="upload-form" onSubmit={uploadCertificate}><label htmlFor="certificate-file">Certificate file</label><input id="certificate-file" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp" onChange={(event) => setFile(event.target.files?.[0] || null)} required /><small>PDF, PNG, JPEG, or WebP · up to 10 MB</small><button className="button button-primary" type="submit" disabled={busy || !file}><FileUp size={16} /> {busy ? 'Uploading…' : 'Upload certificate'}</button></form></section>
        <section className="workspace-panel certificate-list"><div className="panel-heading"><span className="section-kicker">YOUR RECORDS</span><h2>Certificates <span>{dashboard.certificates.length}</span></h2></div>{dashboard.certificates.length ? <div className="record-list">{dashboard.certificates.map((certificate) => <article className="record-row" key={certificate.id}><span className="record-icon"><BadgeCheck size={17} /></span><div className="record-main"><strong>{certificate.reviewedData?.credentialTitle || certificate.extractedData?.credentialTitle || certificate.originalFileName}</strong><small>{certificate.reviewedData?.issuingInstitution || certificate.extractedData?.issuingInstitution || certificate.originalFileName}</small></div><span className={`status-tag status-${certificate.status.toLowerCase()}`}>{certificate.status}</span>{certificate.status === 'DRAFT' && <button className="record-action" type="button" onClick={() => selectDraft(certificate)}>Review <ArrowRight size={13} /></button>}{certificate.status === 'APPROVED' && <Link className="record-action" to={`/verify/${certificate.publicId}`}>Verify <ArrowRight size={13} /></Link>}{certificate.status === 'REJECTED' && <small className="decision-note">{certificate.decisionReason}</small>}</article>)}</div> : <div className="empty-state"><span><Plus size={19} /></span><p>Your issued credentials will appear here.</p></div>}</section></div>
      {selected && <section className="workspace-panel review-panel"><div className="panel-heading"><span className="section-kicker">REVIEW BEFORE YOU SUBMIT</span><h2>{selected.originalFileName}</h2><p>{selected.extractionStatus === 'COMPLETED' ? 'Check the extracted details and correct anything that needs a closer look.' : selected.extractionMessage || 'Enter the certificate details below.'}</p></div><form className="review-form" onSubmit={saveReview}>{fields.map(([key, label, type]) => <label key={key}>{label}<input type={type} value={review[key] || ''} onChange={(event) => setReview({ ...review, [key]: event.target.value })} required={['recipientName', 'credentialTitle', 'issuingInstitution', 'issuedOn'].includes(key)} /></label>)}<label className="review-description">Description<textarea rows="3" maxLength="2000" value={review.description || ''} onChange={(event) => setReview({ ...review, description: event.target.value })} /></label><div className="review-actions"><button type="button" className="button button-secondary" onClick={() => setSelected(null)}>Close</button><button type="submit" className="button button-secondary" disabled={busy}>Save review</button><button type="button" className="button button-primary" onClick={submitReview} disabled={busy || !selected.reviewedData}>Submit to issuer <ArrowRight size={15} /></button></div></form></section>}
    </section>
  </main>
}