const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') })

const express = require('express')
const cors = require('cors')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { Pool } = require('pg')

const app = express()
const port = process.env.PORT || 4000

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required')
}

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is required')
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
})

const allowedOrigins = process.env.CLIENT_ORIGIN
  ? process.env.CLIENT_ORIGIN.split(',').map((value) => value.trim())
  : true

app.use(
  cors({
    origin: allowedOrigins,
    credentials: false
  })
)
app.use(express.json())

const sanitizeUser = (row) => ({
  id: row.id,
  email: row.email,
  displayName: row.display_name,
  createdAt: row.created_at
})

const createToken = (user) => {
  return jwt.sign(
    { sub: user.id, email: user.email, displayName: user.displayName },
    process.env.JWT_SECRET,
    { expiresIn: '1d' }
  )
}

const authenticate = (req, res, next) => {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing authorization header' })
  }

  const token = header.replace('Bearer ', '')
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET)
    next()
  } catch {
    res.status(401).json({ message: 'Invalid or expired token' })
  }
}

app.get('/health', (req, res) => {
  res.json({ ok: true })
})

app.post('/api/auth/register', async (req, res) => {
  const { email, password, displayName } = req.body ?? {}

  if (!email || !password || !displayName) {
    return res.status(400).json({ message: 'displayName, email, and password are required' })
  }

  const normalizedEmail = String(email).toLowerCase().trim()
  const trimmedName = String(displayName).trim().slice(0, 80)

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalizedEmail)) {
    return res.status(400).json({ message: 'Email format looks invalid' })
  }

  if (password.length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters long' })
  }

  try {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [normalizedEmail])
    if (existing.rowCount > 0) {
      return res.status(409).json({ message: 'Account already exists for that email' })
    }

    const hash = await bcrypt.hash(password, 10)
    const result = await pool.query(
      `
        INSERT INTO users (display_name, email, password_hash)
        VALUES ($1, $2, $3)
        RETURNING id, display_name, email, created_at
      `,
      [trimmedName, normalizedEmail, hash]
    )

    const user = sanitizeUser(result.rows[0])
    const token = createToken(user)
    res.status(201).json({ user, token })
  } catch (error) {
    console.error('Register failed', error)
    res.status(500).json({ message: 'Unable to create account right now' })
  }
})

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body ?? {}

  if (!email || !password) {
    return res.status(400).json({ message: 'email and password are required' })
  }

  const normalizedEmail = String(email).toLowerCase().trim()

  try {
    const result = await pool.query(
      'SELECT id, display_name, email, password_hash, created_at FROM users WHERE email = $1',
      [normalizedEmail]
    )

    if (result.rowCount === 0) {
      return res.status(401).json({ message: 'Invalid credentials' })
    }

    const row = result.rows[0]
    const isValid = await bcrypt.compare(password, row.password_hash)

    if (!isValid) {
      return res.status(401).json({ message: 'Invalid credentials' })
    }

    const user = sanitizeUser(row)
    const token = createToken(user)
    res.json({ user, token })
  } catch (error) {
    console.error('Login failed', error)
    res.status(500).json({ message: 'Unable to login' })
  }
})

app.get('/api/auth/me', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, display_name, email, created_at FROM users WHERE id = $1',
      [req.user.sub]
    )

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'User not found' })
    }

    res.json({ user: sanitizeUser(result.rows[0]) })
  } catch (error) {
    console.error('Me endpoint failed', error)
    res.status(500).json({ message: 'Unable to fetch profile' })
  }
})

app.use((err, req, res, next) => {
  console.error('Unhandled error', err)
  res.status(500).json({ message: 'Unexpected server error' })
})

app.listen(port, () => {
  console.log(`Auth API running on http://localhost:${port}`)
})
