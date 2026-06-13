// Auth handler — uses Supabase REST API directly (no npm needed)

function supabase() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY')
  return { url, key }
}

async function sbFetch(path, opts = {}) {
  const { url, key } = supabase()
  const res = await fetch(`${url}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      ...(opts.headers || {})
    }
  })
  const text = await res.text()
  try { return { status: res.status, data: JSON.parse(text) }
  } catch { return { status: res.status, data: { error: text } } }
}

async function getUser(token) {
  const { url, key } = supabase()
  const res = await fetch(`${url}/auth/v1/user`, {
    headers: { 'apikey': key, 'Authorization': `Bearer ${token}` }
  })
  if (!res.ok) return null
  const u = await res.json()
  return u?.id ? u : null
}

function formatUser(u) {
  return {
    id: u.id,
    email: u.email,
    name: u.user_metadata?.full_name || u.user_metadata?.name || u.user_metadata?.user_name || u.email?.split('@')[0],
    avatar: u.user_metadata?.avatar_url || u.user_metadata?.picture || null,
    provider: u.app_metadata?.provider || 'email'
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  // Redirect jika akses /api/auth langsung
  if (req.method === 'GET') {
    const u = new URL(req.url, `https://${req.headers.host}`)
    const cleanPath = u.pathname.replace(/^\/api\/auth\/?/, '') || '/'
    if (cleanPath === '' || cleanPath === '/') {
      const siteUrl = process.env.SITE_URL || `https://${req.headers.host}`
      res.setHeader('Location', `${siteUrl}/login`)
      return res.status(302).end()
    }
  }

  // Always return JSON
  res.setHeader('Content-Type', 'application/json')

  let path = '/'
  try {
    const u = new URL(req.url, `https://${req.headers.host}`)
    path = u.pathname.replace(/^\/api\/auth/, '') || '/'
  } catch {}
  // ... (sisanya kode lama tetap sama)

  try {
    const { url, key } = supabase()

    // GET /api/auth/me
    if (req.method === 'GET' && path === '/me') {
      const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
      if (!token) return res.status(401).json({ error: 'No token' })
      const u = await getUser(token)
      if (!u) return res.status(401).json({ error: 'Invalid token' })
      return res.status(200).json(formatUser(u))
    }

    // POST /api/auth/login
    if (req.method === 'POST' && path === '/login') {
      const { email, password } = req.body || {}
      if (!email || !password) return res.status(400).json({ error: 'Email and password required' })
      const r = await fetch(`${url}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': key },
        body: JSON.stringify({ email, password })
      })
      const d = await r.json()
      if (!r.ok || !d.access_token) return res.status(401).json({ error: d.error_description || d.msg || 'Login failed' })
      return res.status(200).json({ token: d.access_token, user: formatUser(d.user) })
    }

    // POST /api/auth/register
    if (req.method === 'POST' && path === '/register') {
      const { email, password, name } = req.body || {}
      if (!email || !password) return res.status(400).json({ error: 'Email and password required' })
      const r = await fetch(`${url}/auth/v1/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': key },
        body: JSON.stringify({ email, password, data: { full_name: name || email.split('@')[0] } })
      })
      const d = await r.json()
      if (!r.ok) return res.status(400).json({ error: d.error_description || d.msg || 'Registration failed' })
      if (d.access_token) {
        return res.status(200).json({ token: d.access_token, user: formatUser(d.user) })
      }
      return res.status(200).json({ message: 'Check your email to confirm registration' })
    }

    // GET /api/auth/oauth?provider=google|github
    if (req.method === 'GET' && path === '/oauth') {
      const u2 = new URL(req.url, `https://${req.headers.host}`)
      const provider = u2.searchParams.get('provider')
      if (!['google', 'github'].includes(provider)) return res.status(400).json({ error: 'Invalid provider' })
      const siteUrl = process.env.SITE_URL || `https://${req.headers.host}`
      const redirectTo = `${siteUrl}/api/auth/callback`
      const oauthUrl = `${url}/auth/v1/authorize?provider=${provider}&redirect_to=${encodeURIComponent(redirectTo)}`
      return res.status(200).json({ url: oauthUrl })
    }

    // GET /api/auth/callback — exchange code
    if (req.method === 'GET' && path === '/callback') {
      const u2 = new URL(req.url, `https://${req.headers.host}`)
      const code = u2.searchParams.get('code')
      const siteUrl = process.env.SITE_URL || `https://${req.headers.host}`

      if (!code) {
        res.setHeader('Location', `${siteUrl}/login?error=no_code`)
        return res.status(302).end()
      }

      const r = await fetch(`${url}/auth/v1/token?grant_type=pkce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': key },
        body: JSON.stringify({ auth_code: code })
      })
      const d = await r.json()

      if (!r.ok || !d.access_token) {
        // Try alternative exchange
        const r2 = await fetch(`${url}/auth/v1/token?grant_type=authorization_code`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': key },
          body: JSON.stringify({ code })
        })
        const d2 = await r2.json()
        if (!r2.ok || !d2.access_token) {
          res.setHeader('Location', `${siteUrl}/login?error=${encodeURIComponent(d2.error_description || 'OAuth failed')}`)
          return res.status(302).end()
        }
        res.setHeader('Location', `${siteUrl}/chat#token=${d2.access_token}`)
        return res.status(302).end()
      }

      res.setHeader('Location', `${siteUrl}/chat#token=${d.access_token}`)
      return res.status(302).end()
    }

    // POST /api/auth/logout
    if (req.method === 'POST' && path === '/logout') {
      const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
      if (token) {
        await fetch(`${url}/auth/v1/logout`, {
          method: 'POST',
          headers: { 'apikey': key, 'Authorization': `Bearer ${token}` }
        }).catch(() => {})
      }
      return res.status(200).json({ ok: true })
    }

    return res.status(404).json({ error: 'Not found' })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
