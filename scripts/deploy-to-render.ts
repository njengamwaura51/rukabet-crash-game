import axios from 'axios'
import dotenv from 'dotenv'

dotenv.config()

const RENDER_API_BASE = 'https://api.render.com/v1'

export async function deployToRender(apiKey?: string) {
  const token = apiKey || process.env.RENDER_API_KEY

  if (!token) {
    console.error(`
❌ Render API Key is required!
Usage:
  npx tsx scripts/deploy-to-render.ts --api-key=<your_render_api_key>
or set RENDER_API_KEY in your environment or .env file.
    `)
    process.exit(1)
  }

  const client = axios.create({
    baseURL: RENDER_API_BASE,
    headers: {
      Authorization: `Bearer ${token.trim()}`,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    }
  })

  try {
    console.log('🔄 Authenticating with Render API...')
    const ownersRes = await client.get('/owners')
    const owners = ownersRes.data
    if (!owners || owners.length === 0) {
      console.error('❌ No Render owner account found for this API key.')
      process.exit(1)
    }

    const owner = owners[0].owner
    console.log(`✅ Authenticated as Render user: ${owner.name || owner.email} (ID: ${owner.id})`)

    console.log('📋 Fetching existing Render services...')
    const servicesRes = await client.get('/services?limit=50')
    const services = servicesRes.data || []
    console.log(`Found ${services.length} existing service(s) on Render.`)

    const appService = services.find((s: any) => s.service?.name === 'rukabet-app' || s.service?.name === 'rukabet')

    if (appService) {
      console.log(`🚀 Found existing web service '${appService.service.name}' (${appService.service.id}). Triggering deploy...`)
      const deployRes = await client.post(`/services/${appService.service.id}/deploys`, {
        clearCache: 'do_not_clear'
      })
      console.log(`✅ Deployment initiated: Deploy ID ${deployRes.data.id}`)
      console.log(`Live URL: ${appService.service.serviceDetails?.url || 'https://rukabet-app.onrender.com'}`)
    } else {
      console.log(`
ℹ️ Blueprints are recommended for initial 2-service provisioning (MongoDB + Web App):
1. In your Render Dashboard (https://dashboard.render.com), click 'New +' -> 'Blueprint'.
2. Connect your GitHub repository 'rukabet-crash-game'.
3. Render will automatically detect 'render.yaml' and provision:
   - 'rukabet-mongo' (Internal database with 10GB persistent disk)
   - 'rukabet-app' (Web server with pre-configured internal MONGO_URI)
4. Click 'Apply' to launch both services simultaneously.
      `)
    }

    return { success: true, owner, services }
  } catch (error: any) {
    const errorDetails = error.response?.data || error.message
    console.error('❌ Render API operation failed:', JSON.stringify(errorDetails, null, 2))
    process.exit(1)
  }
}

const args = process.argv.slice(2)
const apiKeyArg = args.find(a => a.startsWith('--api-key='))?.replace('--api-key=', '')

if (process.argv[1] && process.argv[1].endsWith('deploy-to-render.ts')) {
  deployToRender(apiKeyArg).catch(console.error)
}
