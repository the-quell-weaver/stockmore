#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const REQUIRED_KEYS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
]

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(scriptDir, '..', '..')
const envFilePath = join(repoRoot, 'src', '.env.local')

function readSupabaseEnv() {
  try {
    const stdout = execFileSync('supabase', ['status', '-o', 'env'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return parseEnv(stdout)
  } catch (error) {
    const message = error?.stderr?.toString()?.trim() || error.message
    console.error('[local-env] 無法讀取 `supabase status -o env`。')
    console.error('[local-env] 請先確認已安裝 Supabase CLI，並啟動 local Supabase：`supabase start`。')
    console.error(`[local-env] 詳細錯誤：${message}`)
    process.exit(1)
  }
}

function parseEnv(content) {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .reduce((acc, line) => {
      const eqIndex = line.indexOf('=')
      if (eqIndex <= 0) return acc
      const key = line.slice(0, eqIndex).trim()
      let value = line.slice(eqIndex + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      acc[key] = value
      return acc
    }, {})
}

function buildValues(supabaseEnv) {
  const publishableKey =
    supabaseEnv.SUPABASE_PUBLISHABLE_KEY ?? supabaseEnv.SUPABASE_ANON_KEY

  const values = {
    NEXT_PUBLIC_SUPABASE_URL: supabaseEnv.SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseEnv.SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
    SUPABASE_SERVICE_ROLE_KEY: supabaseEnv.SUPABASE_SERVICE_ROLE_KEY,
  }

  const missing = REQUIRED_KEYS.filter((key) => !values[key])
  if (missing.length > 0) {
    console.error(
      `[local-env] 缺少必要值：${missing.join(', ')}。請確認 local Supabase 已啟動並可讀取 status。`,
    )
    process.exit(1)
  }

  return values
}

function mergeEnvFile(filePath, updates) {
  let existingLines = []
  try {
    existingLines = readFileSync(filePath, 'utf8').split(/\r?\n/)
  } catch {
    existingLines = []
  }

  const handled = new Set()
  const mergedLines = existingLines.map((line) => {
    const eqIndex = line.indexOf('=')
    if (eqIndex <= 0) return line

    const key = line.slice(0, eqIndex).trim()
    if (!(key in updates)) return line

    handled.add(key)
    return `${key}=${updates[key]}`
  })

  for (const [key, value] of Object.entries(updates)) {
    if (!handled.has(key)) {
      mergedLines.push(`${key}=${value}`)
    }
  }

  const normalized = mergedLines.join('\n').replace(/\n*$/, '\n')
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, normalized, 'utf8')
}

const supabaseEnv = readSupabaseEnv()
const envValues = buildValues(supabaseEnv)
mergeEnvFile(envFilePath, envValues)

console.log(`[local-env] 已更新 ${envFilePath}`)
for (const key of REQUIRED_KEYS) {
  console.log(`[local-env] ${key}=<written>`)
}
