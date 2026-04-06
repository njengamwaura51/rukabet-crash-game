import { Request, Response } from 'express'
import { Deposit } from '../models/Deposit.js'
import { User } from '../models/User.js'
import { getIO } from '../socket.js'

export async function intasendWebhook(req: Request, res: Response) {
  try {
    console.log('📥 IntaSend Webhook received:', JSON.stringify(req.body, null, 2))
    
    const { invoice_id, state, api_ref, value, phone_number } = req.body

    // Only process completed payments
    if (state !== 'COMPLETE') {
      console.log(`⏳ Payment not complete. State: ${state}`)
      return res.status(200).json({ received: true })
    }

    // Find the deposit by api_ref
    const deposit = await Deposit.findOne({ apiRef: api_ref })
    if (!deposit) {
      console.error(`❌ Deposit not found for api_ref: ${api_ref}`)
      return res.status(404).json({ error: 'Deposit not found' })
    }

    // Prevent double processing
    if (deposit.status === 'completed') {
      console.log(`⚠️ Deposit already processed: ${deposit._id}`)
      return res.status(200).json({ received: true, message: 'Already processed' })
    }

    const amount = parseFloat(value)

    // Update deposit status
    deposit.status = 'completed'
    deposit.intasendInvoiceId = invoice_id
    deposit.intasendTrackerId = req.body.id
    await deposit.save()

    // Credit user balance atomically using $inc
    const user = await User.findByIdAndUpdate(
      deposit.userId,
      { $inc: { balance: amount } },
      { new: true }
    )

    if (!user) {
      console.error(`❌ User not found for deposit: ${deposit._id}`)
      return res.status(404).json({ error: 'User not found' })
    }

    console.log(`✅ Deposit completed! User ${user.phone} credited KSH ${amount}. New balance: ${user.balance}`)

    // Emit WebSocket event to update user's UI instantly
    const io = getIO()
    if (io) {
      io.to(`user:${deposit.userId}`).emit('DEPOSIT_SUCCESS', {
        amount,
        newBalance: user.balance,
        depositId: deposit._id.toString(),
        timestamp: new Date().toISOString()
      })
      console.log(`📡 WebSocket DEPOSIT_SUCCESS sent to user:${deposit.userId}`)
    }

    return res.status(200).json({
      success: true,
      message: 'Deposit processed successfully'
    })
  } catch (error: any) {
    console.error('❌ Webhook error:', error.message)
    return res.status(500).json({ error: error.message })
  }
}
