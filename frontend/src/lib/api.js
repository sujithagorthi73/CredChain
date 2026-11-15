const apiBase = import.meta.env.VITE_API_BASE_URL || '/api'

export async function api(path, { token, ...options } = {}) {
  const headers = new Headers(options.headers)
  const isFormData = options.body instanceof FormData
  if (options.body && !isFormData && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)

  let response
  try {
    response = await fetch(`${apiBase}${path}`, { ...options, headers })
  } catch {
    throw new Error('CredChain API is unavailable. Start the backend and check its configuration.')
  }

  const payload = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) throw new Error(payload?.error?.message || 'The request could not be completed.')
  return payload
}