import { Pool } from 'pg'
import siteConfig from '../../config/site.config'

// Persistent key-value store is provided by PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
})

// Initialize the tokens table if it doesn't exist
async function initializeTable() {
  const client = await pool.connect()
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS auth_tokens (
        key VARCHAR(255) PRIMARY KEY,
        value TEXT NOT NULL,
        expires_at TIMESTAMP
      )
    `)
  } finally {
    client.release()
  }
}

// Call initialization on module load
initializeTable().catch(console.error)

export async function getOdAuthTokens(): Promise<{ accessToken: unknown; refreshToken: unknown }> {
  const client = await pool.connect()
  try {
    // Clean up expired tokens
    await client.query('DELETE FROM auth_tokens WHERE expires_at IS NOT NULL AND expires_at < NOW()')

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
  const client = await pool.connect()
  try {
    const expiresAt = new Date(Date.now() + accessTokenExpiry * 1000)

    // Store access token with expiry
    await client.query(
      `INSERT INTO auth_tokens (key, value, expires_at) 
       VALUES ($1, $2, $3) 
       ON CONFLICT (key) 
       DO UPDATE SET value = $2, expires_at = $3`,
      [`${siteConfig.kvPrefix}access_token`, accessToken, expiresAt]
    )

    // Store refresh token without expiry
    await client.query(
      `INSERT INTO auth_tokens (key, value, expires_at) 
       VALUES ($1, $2, NULL) 
       ON CONFLICT (key) 
       DO UPDATE SET value = $2, expires_at = NULL`,
      [`${siteConfig.kvPrefix}refresh_token`, refreshToken]
    )
  } finally {
    client.release()
  }
}
