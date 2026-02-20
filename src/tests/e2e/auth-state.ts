import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { createChunks, stringToBase64URL } from '@supabase/ssr'

const authDir = path.resolve(process.cwd(), 'playwright/.auth')
export const authStatePath = path.join(authDir, 'user.json')
export const testUserPath = path.join(authDir, 'test-user.json')


function loadEnvFiles() {
  const candidatePaths = [
    path.resolve(process.cwd(), '.env.local'),
    path.resolve(process.cwd(), '.env'),
  ]

  for (const envPath of candidatePaths) {
    if (!existsSync(envPath)) continue
    const content = readFileSync(envPath, 'utf8')
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) continue
      const eqIndex = line.indexOf('=')
      if (eqIndex <= 0) continue
      const key = line.slice(0, eqIndex).trim()
      let value = line.slice(eqIndex + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      if (!process.env[key]) {
        process.env[key] = value
      }
    }
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required env var: ${name}`)
  }
  return value
}

function getProjectRef(supabaseUrl: string): string {
  const { hostname } = new URL(supabaseUrl)
  return hostname.split('.')[0]
}

function getCookieSettings(baseUrl: string) {
  const { protocol, hostname } = new URL(baseUrl)
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1'

  return {
    domain: isLocalhost ? 'localhost' : hostname,
    secure: protocol === 'https:' && !isLocalhost,
  }
}

const COOKIE_BASE64_PREFIX = 'base64-'

function buildAuthCookies(
  name: string,
  value: string,
  options: { domain: string; secure: boolean; expires: number },
) {
  const encodedValue = `${COOKIE_BASE64_PREFIX}${stringToBase64URL(value)}`
  const chunks = createChunks(name, encodedValue)
  return chunks.map((chunk) => ({
    name: chunk.name,
    value: chunk.value,
    domain: options.domain,
    path: '/',
    httpOnly: false,
    secure: options.secure,
    sameSite: 'Lax' as const,
    expires: options.expires,
  }))
}

export async function provisionAuthState() {
  loadEnvFiles()
  const supabaseUrl = requiredEnv('NEXT_PUBLIC_SUPABASE_URL')
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? requiredEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')
  const serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5566'

  const id = randomUUID()
  const email = `e2e.${id}@stockmore.local`
  const password = `E2e!${id.replace(/-/g, '')}`

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const createUserResult = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (createUserResult.error || !createUserResult.data.user) {
    throw createUserResult.error ?? new Error('Failed to create e2e user')
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const signInResult = await userClient.auth.signInWithPassword({ email, password })
  if (signInResult.error || !signInResult.data.session) {
    throw signInResult.error ?? new Error('Failed to sign in e2e user')
  }

  const session = signInResult.data.session
  const projectRef = getProjectRef(supabaseUrl)
  const localStorageKey = `sb-${projectRef}-auth-token`
  const cookieName = `sb-${projectRef}-auth-token`
  const cookieSettings = getCookieSettings(baseUrl)

  const expiresEpoch = session.expires_at ?? Math.floor(Date.now() / 1000) + 3600

  const storageValue = JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    expires_in: session.expires_in,
    token_type: session.token_type,
    user: session.user,
  })

  const storageState = {
    cookies: buildAuthCookies(cookieName, storageValue, {
      domain: cookieSettings.domain,
      secure: cookieSettings.secure,
      expires: expiresEpoch,
    }),
    origins: [
      {
        origin: baseUrl,
        localStorage: [
          {
            name: localStorageKey,
            value: storageValue,
          },
        ],
      },
    ],
  }

  await mkdir(authDir, { recursive: true })
  await writeFile(authStatePath, JSON.stringify(storageState, null, 2), 'utf8')
  await writeFile(testUserPath, JSON.stringify({ userId: createUserResult.data.user.id, email }, null, 2), 'utf8')
}

export async function cleanupAuthUser() {
  loadEnvFiles()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return
  }
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  try {
    const content = await readFile(testUserPath, 'utf8')
    const { userId } = JSON.parse(content) as { userId?: string }
    if (userId) {
      await adminClient.auth.admin.deleteUser(userId)
    }
  } catch {
    // best-effort cleanup
  }
}
