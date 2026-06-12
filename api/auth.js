const { createClient } = require('@supabase/supabase-js')

function getSupabase() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key)
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const url = new URL(req.url, `https://${req.headers.host}`)
  const path = url.pathname.replace('/api/auth', '') || '/'

  try {
    const supabase = getSupabase()

    // GET /api/auth/me — verify session token & return user
    if (req.method === 'GET' && path === '/me') {
      const token = req.headers.authorization?.replace('Bearer ', '')
      if (!token) return res.status(401).json({ error: 'No token' })
      const { data: { user }, error } = await supabase.auth.getUser(token)
      if (error || !user) return res.status(401).json({ error: 'Invalid token' })
      return res.status(200).json({
        id: user.id,
        email: user.email,
        name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0],
        avatar: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
        provider: user.app_metadata?.provider || 'email'
      })
    }

    // POST /api/auth/login — email+password login
    if (req.method === 'POST' && path === '/login') {
      const { email, password } = req.body
      if (!email || !password) return res.status(400).json({ error: 'Email and password required' })
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) return res.status(401).json({ error: error.message })
      return res.status(200).json({
        token: data.session.access_token,
        user: {
          id: data.user.id,
          email: data.user.email,
          name: data.user.user_metadata?.full_name || data.user.email?.split('@')[0],
          avatar: data.user.user_metadata?.avatar_url || null,
          provider: 'email'
        }
      })
    }

    // POST /api/auth/register — email+password register
    if (req.method === 'POST' && path === '/register') {
      const { email, password, name } = req.body
      if (!email || !password) return res.status(400).json({ error: 'Email and password required' })
      const { data, error } = await supabase.auth.signUp({
        email, password,
        options: { data: { full_name: name || email.split('@')[0] } }
      })
      if (error) return res.status(400).json({ error: error.message })
      if (!data.session) return res.status(200).json({ message: 'Check your email to confirm registration' })
      return res.status(200).json({
        token: data.session.access_token,
        user: {
          id: data.user.id,
          email: data.user.email,
          name: data.user.user_metadata?.full_name || email.split('@')[0],
          avatar: null,
          provider: 'email'
        }
      })
    }

    // GET /api/auth/oauth?provider=google|github — get OAuth URL
    if (req.method === 'GET' && path === '/oauth') {
      const provider = url.searchParams.get('provider')
      if (!['google', 'github'].includes(provider)) return res.status(400).json({ error: 'Invalid provider' })
      const redirectTo = `${process.env.SITE_URL || `https://${req.headers.host}`}/api/auth/callback`
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo }
      })
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ url: data.url })
    }

    // GET /api/auth/callback — OAuth callback, exchange code for session
    if (req.method === 'GET' && path === '/callback') {
      const code = url.searchParams.get('code')
      if (!code) return res.redirect(302, '/login?error=no_code')
      const { data, error } = await supabase.auth.exchangeCodeForSession(code)
      if (error) return res.redirect(302, `/login?error=${encodeURIComponent(error.message)}`)
      const token = data.session.access_token
      // Redirect to chat with token in hash (never in query string)
      return res.redirect(302, `/chat#token=${token}`)
    }

    // POST /api/auth/logout
    if (req.method === 'POST' && path === '/logout') {
      const token = req.headers.authorization?.replace('Bearer ', '')
      if (token) await supabase.auth.admin.signOut(token).catch(() => {})
      return res.status(200).json({ ok: true })
    }

    return res.status(404).json({ error: 'Not found' })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
