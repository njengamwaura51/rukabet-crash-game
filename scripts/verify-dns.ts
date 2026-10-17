import axios from 'axios'
import dns from 'dns/promises'

const RENDER_API_BASE = 'https://api.render.com/v1'
const SERVICE_ID = 'srv-db9n5161egvs73ft52qg'
const TOKEN = process.env.RENDER_API_KEY || 'rnd_1FN73s0uFVeDjEqkWyqDXZT1t3E1'

async function checkDNS() {
  console.log('🔍 Checking DNS resolution for rukabet.live and www.rukabet.live...\n')

  try {
    const aRecords = await dns.resolve4('rukabet.live')
    console.log(`📌 rukabet.live A records: ${aRecords.join(', ')}`)
    if (aRecords.includes('216.24.57.1')) {
      console.log('   ✅ Apex domain A record is correctly pointing to Render (216.24.57.1)!')
    } else {
      console.log(`   ⏳ Waiting for update... Currently points to: ${aRecords.join(', ')} (Expected: 216.24.57.1)`)
    }
  } catch (err: any) {
    console.log(`   ⚠️ Could not resolve A record for rukabet.live: ${err.message}`)
  }

  try {
    const cnameRecords = await dns.resolveCname('www.rukabet.live')
    console.log(`📌 www.rukabet.live CNAME: ${cnameRecords.join(', ')}`)
    if (cnameRecords.some(r => r.includes('onrender.com'))) {
      console.log('   ✅ www CNAME record is correctly pointing to Render!')
    } else {
      console.log(`   ⏳ Currently points to: ${cnameRecords.join(', ')} (Expected: rukabet-app.onrender.com)`)
    }
  } catch (err: any) {
    console.log(`   ⏳ No CNAME record yet for www.rukabet.live: ${err.message}`)
  }

  console.log('\n🔄 Querying Render Custom Domain status...')
  const client = axios.create({
    baseURL: RENDER_API_BASE,
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' }
  })

  try {
    const res = await client.get(`/services/${SERVICE_ID}/custom-domains`)
    for (const item of res.data) {
      const d = item.customDomain
      console.log(`   Domain: ${d.name.padEnd(20)} Status: ${d.verificationStatus}`)
      if (d.verificationStatus !== 'verified') {
        try {
          await client.post(`/services/${SERVICE_ID}/custom-domains/${d.id}/verify`)
          console.log(`   Triggered verification check for ${d.name}`)
        } catch {}
      }
    }
  } catch (err: any) {
    console.error('Render API error:', err.response?.data || err.message)
  }
}

checkDNS()
