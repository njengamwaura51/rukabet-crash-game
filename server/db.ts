import mongoose from 'mongoose'
import dotenv from 'dotenv'

dotenv.config()

const MONGO_URI = process.env.MONGO_URI

export async function connectDB(): Promise<void> {
  if (!MONGO_URI) {
    console.error('❌ MONGO_URI environment variable is not set!')
    console.error('   Please set MONGO_URI in Heroku config vars:')
    console.error('   heroku config:set MONGO_URI="mongodb+srv://user:pass@cluster.mongodb.net/rukabet"')
    process.exit(1)
  }

  console.log('🔄 Connecting to MongoDB...')
  console.log(`📍 URI: ${MONGO_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`) // Hide credentials

  try {
    await mongoose.connect(MONGO_URI)
    console.log('✅ MongoDB connected successfully')
    console.log(`📦 Database: ${mongoose.connection.name}`)
  } catch (error) {
    console.error('❌ MongoDB connection error:', error)
    process.exit(1)
  }
}

// Handle connection events
mongoose.connection.on('disconnected', () => {
  console.warn('⚠️ MongoDB disconnected')
})

mongoose.connection.on('reconnected', () => {
  console.log('🔄 MongoDB reconnected')
})

mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB error:', err)
})

// Graceful shutdown
process.on('SIGINT', async () => {
  await mongoose.connection.close()
  console.log('MongoDB connection closed through app termination')
  process.exit(0)
})

export default mongoose
