import { useEffect, useState } from 'react'
import { ArrowRight, BadgeCheck, Check, LogOut, ShieldCheck, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/useAuth.js'
import { api } from '../lib/api.js'

export function IssuerDashboard() {
  const { token, user, signOut } = useAuth()
  const [dashboard, setDashboard] = useState({ pendingCount: 0, certificates: [], issuedCertificates: [] })
  const [reasons, setReasons] = useState({})
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busyId, setBusyId] = useState('')

  async function loadDashboard() {
    setDashboard(await api('/issuer/dashboard', { token }))
  }

  useEffect(() => {
    let active = true
    api('/issuer/dashboard', { token }).then((data) => { if (active) setDashboard(data) }).catch((failure) => { if (active) setError(failure.message) })
    return () => { active = false }
  }, [token])

  async function decide(id, action, body = {}) {
    setBusyId(id)
    setError('')
    setMessage('')
    try {
      const { certificate } = await api(`/issuer/certificates/${id}/${action}`, { token, method: 'POST', body: JSON.stringify(body) })
      await loadDashboard()
      setMessage(`${certificate.publicId} ${action === 'approve' ? 'approved and registered' : action === 'reject' ? 'rejected' : 'revoked'}.`)
      setReasons((current) => { const next = { ...current }; delete next[id]; return next })
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusyId('')
    }
  }

  return <main className="workspace-page"><header className="workspace-header"><Link to="/" className="brand"><span className="brand-mark"><ShieldCheck size={19} /></span><span>credchain</span></Link><span className="workspace-divider" /><div className="workspace-heading"><span className="section-kicker">ISSUER CONSOLE</span><strong>{user.institutionName || user.fullName}</strong></div><button className="icon-action" type="button" onClick={signOut} title="Sign out" aria-label="Sign out"><LogOut size={17} /></button></header>
    <section className="workspace-main"><div className="workspace-title"><div><span className="section-kicker">ISSUER REVIEW</span><h1>Credential decisions</h1><p>Review student-submitted credentials and maintain your verified record.</p></div><span className="wallet-mark"><ShieldCheck size={24} /></span></div>
      {error && <p className="notice notice-error" role="alert">{error}</p>}{message && <p className="notice notice-success" role="status">{message}</p>}
      <section className="workspace-panel issuer-queue"><div className="panel-heading"><span className="section-kicker">REQUIRES REVIEW</span><h2>Submission queue <span>{dashboard.pendingCount}</span></h2></div>{dashboard.certificates.length ? <div className="issuer-records">{dashboard.certificates.map((certificate) => <article className="issuer-record" key={certificate.id}><div className="issuer-record-head"><span className="record-icon"><BadgeCheck size={18} /></span><div><strong>{certificate.reviewedData?.credentialTitle || 'Untitled credential'}</strong><small>{certificate.student?.fullName} · {certificate.reviewedData?.issuingInstitution}</small></div><span className="status-tag status-submitted">SUBMITTED</span></div><dl className="credential-details"><div><dt>Recipient</dt><dd>{certificate.reviewedData?.recipientName}</dd></div><div><dt>Issued</dt><dd>{certificate.reviewedData?.issuedOn}</dd></div><div><dt>Credential ID</dt><dd>{certificate.reviewedData?.credentialId || 'Not provided'}</dd></div></dl>{certificate.reviewedData?.description && <p className="issuer-description">{certificate.reviewedData.description}</p>}<div className="issuer-actions"><button className="button button-primary" type="button" disabled={busyId === certificate.id} onClick={() => decide(certificate.id, 'approve')}><Check size={15} /> Approve &amp; register</button><div className="reject-action"><input aria-label="Rejection reason" placeholder="Reason for rejection" value={reasons[certificate.id] || ''} onChange={(event) => setReasons({ ...reasons, [certificate.id]: event.target.value })} /><button className="button button-secondary" type="button" disabled={busyId === certificate.id || (reasons[certificate.id] || '').trim().length < 5} onClick={() => decide(certificate.id, 'reject', { reason: reasons[certificate.id] })}><X size={15} /> Reject</button></div></div></article>)}</div> : <div className="empty-state"><span><Check size={18} /></span><p>No certificates are waiting for review.</p></div>}</section>
      <section className="workspace-panel issued-panel"><div className="panel-heading"><span className="section-kicker">YOUR DECISIONS</span><h2>Issued credentials <span>{dashboard.issuedCertificates.length}</span></h2></div>{dashboard.issuedCertificates.length ? <div className="record-list">{dashboard.issuedCertificates.map((certificate) => <article className="record-row" key={certificate.id}><span className="record-icon"><BadgeCheck size={17} /></span><div className="record-main"><strong>{certificate.reviewedData?.credentialTitle}</strong><small>{certificate.student?.fullName} · {certificate.publicId}</small></div><span className={`status-tag status-${certificate.status.toLowerCase()}`}>{certificate.status}</span><Link className="record-action" to={`/verify/${certificate.publicId}`}>Public proof <ArrowRight size={13} /></Link>{certificate.status === 'APPROVED' && <button className="record-action revoke-action" type="button" disabled={busyId === certificate.id} onClick={() => decide(certificate.id, 'revoke')}>Revoke</button>}</article>)}</div> : <p className="quiet-empty">Approved and revoked credentials will appear here.</p>}</section>
    </section>
  </main>
}