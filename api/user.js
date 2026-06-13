async function getUser(req) {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
  if (!token || !url || !key) return null
  const r = await fetch(`${url}/auth/v1/user`, {
    headers: { 'apikey': key, 'Authorization': `Bearer ${token}` }
  })
  if (!r.ok) return null
  const u = await r.json()
  return u?.id ? u : null
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Content-Type', 'application/json')
  if (req.method === 'OPTIONS') return res.status(200).end()
  try {
    const user = await getUser(req)
    if (!user) return res.status(401).json({ error: 'Unauthorized' })
    if (req.method === 'GET') {
      return res.status(200).json({
        id: user.id,
        email: user.email,
        name: user.user_metadata?.full_name || user.user_metadata?.name || user.user_metadata?.user_name || user.email?.split('@')[0],
        avatar: user.user_metadata?.avatar_url || null,
        provider: user.app_metadata?.provider || 'email'
      })
    }
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
