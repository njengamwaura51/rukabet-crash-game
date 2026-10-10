import { Request, Response } from 'express'
import { Deposit } from '../models/Deposit.js'
import { User } from '../models/User.js'
import { getIO } from '../socket.js'

const AMOUNT_TOLERANCE = 0.01

export async function intasendWebhook(req: Request, res: Response) {
  try {
    console.log('📥 IntaSend Webhook received:', JSON.stringify(req.body, null, 2))

    const { invoice_id, state, api_ref, value } = req.body

    // Only process completed payments
    if (state !== 'COMPLETE') {
      console.log(`⏳ Payment not complete. State: ${state}`)
      return res.status(200).json({ received: true })
    }

    if (typeof api_ref !== 'string' || !api_ref.trim()) {
      return res.status(400).json({ error: 'Missing api_ref' })
    }

    const webhookAmount = Number.parseFloat(String(value))
    if (!Number.isFinite(webhookAmount) || webhookAmount <= 0) {
      return res.status(400).json({ error: 'Invalid webhook amount' })
    }

    // Validate there is a pending deposit for this reference.
    const pendingDeposit = await Deposit.findOne({ apiRef: api_ref, status: 'pending' })

    if (!pendingDeposit) {
      const existingDeposit = await Deposit.findOne({ apiRef: api_ref })

      if (existingDeposit?.status === 'completed') {
        console.log(`⚠️ Deposit already processed: ${existingDeposit._id}`)
        return res.status(200).json({ received: true, message: 'Already processed' })
      }

      console.error(`❌ Pending deposit not found for api_ref: ${api_ref}`)
      return res.status(404).json({ error: 'Pending deposit not found' })
    }

    if (pendingDeposit.intasendInvoiceId && invoice_id && pendingDeposit.intasendInvoiceId !== invoice_id) {
      console.error(`❌ Invoice mismatch for deposit ${pendingDeposit._id}`)
      return res.status(400).json({ error: 'Invoice mismatch' })
    }

    const amountMatches = Math.abs(webhookAmount - pendingDeposit.amount) <= AMOUNT_TOLERANCE
    if (!amountMatches) {
      console.error(`❌ Amount mismatch for deposit ${pendingDeposit._id}. Expected ${pendingDeposit.amount}, got ${webhookAmount}`)
      return res.status(400).json({ error: 'Amount mismatch' })
    }

    // Mark as completed only if still pending to prevent race-condition double crediting.
    const completedDeposit = await Deposit.findOneAndUpdate(
      { _id: pendingDeposit._id, status: 'pending' },
      {
        $set: {
          status: 'completed',
          intasendInvoiceId: invoice_id || pendingDeposit.intasendInvoiceId,
          intasendTrackerId: req.body.id || pendingDeposit.intasendTrackerId
        }
      },
      { new: true }
    )

    if (!completedDeposit) {
      console.log(`⚠️ Deposit already processed concurrently: ${pendingDeposit._id}`)
      return res.status(200).json({ received: true, message: 'Already processed' })
    }

    // Credit user balance atomically using verified deposit amount
    const user = await User.findByIdAndUpdate(
      completedDeposit.userId,
      { $inc: { balance: completedDeposit.amount } },
      { new: true }
    )

    if (!user) {
      console.error(`❌ User not found for deposit: ${completedDeposit._id}`)
      return res.status(404).json({ error: 'User not found' })
    }

    console.log(`✅ Deposit completed! User ${user.phone} credited KSH ${completedDeposit.amount}. New balance: ${user.balance}`)

    // Emit WebSocket event to update user's UI instantly
    const io = getIO()
    if (io) {
      io.to(`user:${completedDeposit.userId}`).emit('DEPOSIT_SUCCESS', {
        amount: completedDeposit.amount,
        newBalance: user.balance,
        depositId: completedDeposit._id.toString(),
        apiRef: completedDeposit.apiRef,
        timestamp: new Date().toISOString()
      })
      console.log(`📡 WebSocket DEPOSIT_SUCCESS sent to user:${completedDeposit.userId}`)
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
