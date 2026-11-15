import { useEffect, useState } from 'react'
import { ArrowLeft, BadgeCheck, CircleAlert, ShieldCheck } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../lib/api.js'

export function PublicVerification() {
  const { publicId } = useParams()
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    api(`/public/certificates/${encodeURIComponent(publicId)}/verify`)
      .then((data) => { if (active) setResult(data) })
      .catch((failure) => { if (active) setError(failure.message) })
    return () => { active = false }
  }, [publicId])

  return <main className="public-verify-page"><header className="public-verify-header"><Link to="/" className="brand"><span className="brand-mark"><ShieldCheck size={19} /></span><span>credchain</span></Link><span>PUBLIC VERIFICATION</span></header><section className="public-proof"><Link to="/" className="back-link"><ArrowLeft size={15} /> CredChain home</Link>{error ? <div className="verification-card"><span className="proof-icon proof-icon-error"><CircleAlert size={23} /></span><span className="section-kicker">VERIFICATION UNAVAILABLE</span><h1>We couldn’t verify this record.</h1><p>{error}</p></div> : !result ? <div className="app-state"><span className="loading-mark" /><p>Checking issuer record and blockchain proof…</p></div> : <div className="verification-card"><span className={`proof-icon ${result.verified ? '' : 'proof-icon-error'}`}>{result.verified ? <BadgeCheck size={25} /> : <CircleAlert size={23} />}</span><span className="section-kicker">CREDENTIAL {result.status}</span><h1>{result.verified ? 'This credential is authentic.' : result.status === 'REVOKED' ? 'This credential was revoked.' : 'This record could not be verified.'}</h1><p className="proof-id">{result.publicId}</p>{result.credential && <dl className="public-details"><div><dt>Recipient</dt><dd>{result.credential.recipientName}</dd></div><div><dt>Credential</dt><dd>{result.credential.credentialTitle}</dd></div><div><dt>Issued by</dt><dd>{result.credential.issuingInstitution}</dd></div><div><dt>Issue date</dt><dd>{result.credential.issuedOn}</dd></div>{result.credential.expiresOn && <div><dt>Expires</dt><dd>{result.credential.expiresOn}</dd></div>}</dl>}<div className="proof-chain"><span>ON-CHAIN HASH MATCH</span><strong>{result.hashMatches ? 'CONFIRMED' : 'NOT CONFIRMED'}</strong><small>Monad chain {result.blockchain.chainId || 'unavailable'}</small></div></div>}</section></main>
}