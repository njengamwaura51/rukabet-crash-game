import { Request, Response } from 'express'
import { DepositModel } from '../models/Deposit.js'
import { UserModel } from '../models/User.js'
import { getIO } from '../socket.js'

export async function intasendWebhook(req: Request, res: Response) {
  try {
    console.log('📥 IntaSend Webhook:', JSON.stringify(req.body, null, 2))
    const { invoice_id, state, api_ref, value } = req.body
    
    if (state !== 'COMPLETE') {
      console.log(`⏳ Payment not complete. State: ${state}`)
      return res.status(200).json({ received: true })
    }

    const deposit = DepositModel.findByApiRef(api_ref)
    if (!deposit) return res.status(404).json({ error: 'Deposit not found' })
    if (deposit.status === 'completed') return res.status(200).json({ received: true, message: 'Already processed' })

    const amount = parseFloat(value)
    DepositModel.updateStatus(deposit.id, 'completed', invoice_id, req.body.id)
    UserModel.updateBalance(deposit.user_id, amount)
    
    const user = UserModel.findById(deposit.user_id)!
    console.log(`✅ Deposit completed! User ${user.phone} credited KSH ${amount}. New balance: ${user.balance}`)

    const io = getIO()
    if (io) {
      io.to(`user:${deposit.user_id}`).emit('DEPOSIT_SUCCESS', {
        amount, newBalance: user.balance, depositId: deposit.id, timestamp: new Date().toISOString()
      })
      console.log(`📡 WebSocket event sent to user:${deposit.user_id}`)
    }

    return res.status(200).json({ success: true, message: 'Deposit processed' })
  } catch (error: any) {
    console.error('❌ Webhook error:', error.message)
    return res.status(500).json({ error: error.message })
  }
}
