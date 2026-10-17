import axios from 'axios'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

const targetUrl = process.env.PUBLIC_APP_URL || 'https://rukabet.live'
const adminUser = process.env.ADMIN_USERNAME || 'pirate101'
const adminPass = process.env.ADMIN_PASSWORD || '117402'

export async function exportDatabaseFromLive(appUrl: string = targetUrl) {
  console.log(`🔑 Logging into Admin API at ${appUrl}...`)
  
  const loginRes = await axios.post(`${appUrl}/api/admin/login`, {
    username: adminUser,
    password: adminPass
  })

  const token = loginRes.data.token
  if (!token) throw new Error('Admin login failed: No token returned')
  console.log('✅ Admin login successful.')

  console.log('📦 Fetching database snapshot...')
  const exportRes = await axios.get(`${appUrl}/api/admin/database/export`, {
    headers: { Authorization: `Bearer ${token}` }
  })

  const dataDir = path.join(rootDir, 'data')
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }

  const outputPath = path.join(dataDir, 'production_snapshot.json')
  fs.writeFileSync(outputPath, JSON.stringify(exportRes.data, null, 2), 'utf-8')

  console.log(`✅ Snapshot saved to: ${outputPath}`)
  console.log('Summary:', exportRes.data.counts)
  return exportRes.data
}

if (process.argv[1] && process.argv[1].endsWith('export-database.ts')) {
  exportDatabaseFromLive().catch(err => {
    console.error('Export failed:', err.response?.data || err.message)
    process.exit(1)
  })
}
