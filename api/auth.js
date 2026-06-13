async function sbFetch(url, path, key, opts = {}) {
  const r = await fetch(`${url}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      ...(opts.headers || {})
    }
  })
  const text = await r.text()
  let data
  try { data = JSON.parse(text) }
  catch { data = { error: text.slice(0, 200) } }
  return { ok: r.ok, status: r.status, data }
}

function getEnv() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  const site = process.env.SITE_URL || 'https://www.websiteku.dev'
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars')
  return { url, key, site }
}

function fmtUser(u) {
  if (!u) return null
  return {
    id: u.id,
    email: u.email,
    name: u.user_metadata?.full_name || u.user_metadata?.name || u.user_metadata?.user_name || u.email?.split('@')[0] || 'User',
    avatar: u.user_metadata?.avatar_url || u.user_metadata?.picture || null,
    provider: u.app_metadata?.provider || 'email'
  }
}

async function getUser(url, key, token) {
  if (!token) return null
  const r = await fetch(`${url}/auth/v1/user`, {
    headers: { 'apikey': key, 'Authorization': `Bearer ${token}` }
  })
  if (!r.ok) return null
  const u = await r.json().catch(() => null)
  return u?.id ? u : null
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Content-Type', 'application/json')
  if (req.method === 'OPTIONS') return res.status(200).end()

  // Parse path
  let path = '/', search = ''
  try {
    const u = new URL(req.url, `https://${req.headers.host}`)
    path = u.pathname.replace(/^\/api\/auth/, '') || '/'
    search = u.search
  } catch {}

  try {
    const { url, key, site } = getEnv()

    // GET /api/auth/me
    if (req.method === 'GET' && path === '/me') {
      const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
      const u = await getUser(url, key, token)
      if (!u) return res.status(401).json({ error: 'Invalid or expired token' })
      return res.status(200).json(fmtUser(u))
    }

    // POST /api/auth/login
    if (req.method === 'POST' && path === '/login') {
      const { email, password } = req.body || {}
      if (!email || !password) return res.status(400).json({ error: 'Email and password required' })
      const { ok, data } = await sbFetch(url, `/auth/v1/token?grant_type=password`, key, {
        method: 'POST',
        headers: { 'apikey': key, 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({ email, password })
      })
      if (!ok || !data.access_token) return res.status(401).json({ error: data.error_description || data.msg || data.error || 'Login failed' })
      return res.status(200).json({ token: data.access_token, user: fmtUser(data.user) })
    }

    // POST /api/auth/register
    if (req.method === 'POST' && path === '/register') {
      const { email, password, name } = req.body || {}
      if (!email || !password) return res.status(400).json({ error: 'Email and password required' })
      const { ok, data } = await sbFetch(url, '/auth/v1/signup', key, {
        method: 'POST',
        headers: { 'apikey': key, 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({ email, password, data: { full_name: name || email.split('@')[0] } })
      })
      if (!ok) return res.status(400).json({ error: data.error_description || data.msg || data.error || 'Registration failed' })
      if (data.access_token) return res.status(200).json({ token: data.access_token, user: fmtUser(data.user) })
      return res.status(200).json({ message: 'Check your email to confirm your account' })
    }

    // GET /api/auth/oauth?provider=google|github
    if (req.method === 'GET' && path === '/oauth') {
      const qs = new URLSearchParams(search)
      const provider = qs.get('provider')
      if (!['google', 'github'].includes(provider)) return res.status(400).json({ error: 'Invalid provider' })
      const redirectTo = `${site}/api/auth/callback`
      const oauthUrl = `${url}/auth/v1/authorize?provider=${provider}&redirect_to=${encodeURIComponent(redirectTo)}`
      return res.status(200).json({ url: oauthUrl })
    }

    // GET /api/auth/callback
    if (req.method === 'GET' && path === '/callback') {
      res.setHeader('Content-Type', 'text/html')
      const qs = new URLSearchParams(search)
      const code = qs.get('code')
      const errorParam = qs.get('error')

      if (errorParam) {
        res.setHeader('Location', `${site}/login?error=${encodeURIComponent(errorParam)}`)
        return res.status(302).end()
      }

      if (!code) {
        res.setHeader('Location', `${site}/login?error=no_code`)
        return res.status(302).end()
      }

      // Try PKCE exchange
      const { ok, data } = await sbFetch(url, `/auth/v1/token?grant_type=pkce`, key, {
        method: 'POST',
        headers: { 'apikey': key, 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({ auth_code: code })
      })

      if (ok && data.access_token) {
        res.setHeader('Location', `${site}/chat#token=${data.access_token}`)
        return res.status(302).end()
      }

      // Fallback: redirect with code so frontend can handle
      res.setHeader('Location', `${site}/chat#code=${code}`)
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

    return res.status(404).json({ error: 'Auth endpoint not found' })

  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
