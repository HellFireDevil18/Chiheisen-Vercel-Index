import { Pool } from 'pg'
import siteConfig from '../../config/site.config'

// Persistent key-value store is provided by PostgreSQL
let pool: Pool | null = null
let isInitialized = false

function getPool(): Pool {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is not set. Please configure your PostgreSQL database.')
    }
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // Optimize for serverless
      max: 1,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    })
  }
  return pool
}

// Initialize the database table if it doesn't exist
async function initDatabase() {
  if (isInitialized) return
  
  const pool = getPool()
  const client = await pool.connect()
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS auth_tokens (
        key VARCHAR(255) PRIMARY KEY,
        value TEXT NOT NULL,
        expires_at TIMESTAMP
      )
    `)
    isInitialized = true
  } finally {
    client.release()
  }
}

export async function getOdAuthTokens(): Promise<{ accessToken: unknown; refreshToken: unknown }> {
  try {
    await initDatabase()
    const pool = getPool()
    const client = await pool.connect()
    try {
      const accessTokenResult = await client.query(
        'SELECT value FROM auth_tokens WHERE key = $1 AND (expires_at IS NULL OR expires_at > NOW())',
        [`${siteConfig.kvPrefix}access_token`]
      )
      const refreshTokenResult = await client.query(
        'SELECT value FROM auth_tokens WHERE key = $1',
        [`${siteConfig.kvPrefix}refresh_token`]
      )

      return {
        accessToken: accessTokenResult.rows[0]?.value || null,
        refreshToken: refreshTokenResult.rows[0]?.value || null,
      }
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('Error getting auth tokens from database:', error)
    throw error
  }
}

export async function storeOdAuthTokens({
  accessToken,
  accessTokenExpiry,
  refreshToken,
}: {
  accessToken: string
  accessTokenExpiry: number
  refreshToken: string
}): Promise<void> {
  try {
    await initDatabase()
    const pool = getPool()
    const client = await pool.connect()
    try {
      const accessTokenExpiresAt = new Date(Date.now() + accessTokenExpiry * 1000)

      await client.query(
        `INSERT INTO auth_tokens (key, value, expires_at) 
         VALUES ($1, $2, $3) 
         ON CONFLICT (key) DO UPDATE SET value = $2, expires_at = $3`,
        [`${siteConfig.kvPrefix}access_token`, accessToken, accessTokenExpiresAt]
      )

      await client.query(
        `INSERT INTO auth_tokens (key, value, expires_at) 
         VALUES ($1, $2, NULL) 
         ON CONFLICT (key) DO UPDATE SET value = $2, expires_at = NULL`,
        [`${siteConfig.kvPrefix}refresh_token`, refreshToken]
      )
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('Error storing auth tokens to database:', error)
    throw error
  }
}
