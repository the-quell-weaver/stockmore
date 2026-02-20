import { cleanupAuthUser } from './auth-state'

async function globalTeardown() {
  await cleanupAuthUser()
}

export default globalTeardown
