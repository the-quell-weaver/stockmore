import { provisionAuthState } from './auth-state'

async function globalSetup() {
  await provisionAuthState()
}

export default globalSetup
