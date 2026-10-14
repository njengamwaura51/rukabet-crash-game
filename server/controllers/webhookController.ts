import { Request, Response } from 'express'
import { Deposit } from '../models/Deposit.js'
import { User } from '../models/User.js'
import { getIO } from '../socket.js'

const AMOUNT_TOLERANCE = 0.05

export async function paydWebhook(req: Request, res: Response) {
  try {
    const payload = req.body || {}
    console.log('📥 Payd Webhook received:', JSON.stringify(payload, null, 2))

    // 1. Extract external transaction reference
    const externalRef =
      payload.transaction_reference ||
      payload.correlator_id ||
      payload.reference ||
      payload.data?.transaction_reference ||
      payload.data?.reference ||
      null

    // Extract internal reference from narration or metadata
    const narrationText = typeof payload.narration === 'string' ? payload.narration : ''
    const extractedFromNarration = narrationText.replace(/^Deposit\s+/i, '').trim()
    const internalRef =
      payload.api_ref ||
      payload.merchant_reference ||
      payload.data?.api_ref ||
      payload.data?.merchant_reference ||
      (extractedFromNarration.length > 0 ? extractedFromNarration : null)

    const rawStatus = (payload.status || payload.state || payload.data?.status || '').toString().toUpperCase()
    const resultCode = payload.result_code ?? payload.status_code ?? payload.data?.result_code
    
    // Status check for Payd
    const isSuccess =
      rawStatus === 'SUCCESS' ||
      rawStatus === 'COMPLETED' ||
      rawStatus === 'COMPLETE' ||
      rawStatus === 'PAID' ||
      resultCode === 0 ||
      resultCode === '0' ||
      resultCode === 200

    if (!externalRef && !internalRef) {
      console.warn('⚠️ Webhook payload missing references')
      // Always return 200 OK so Payd doesn't infinitely retry malformed payloads
      return res.status(200).json({ status: 'ok', message: 'No reference found' })
    }

    // 2. Find matching deposit in database
    const queryConditions: any[] = []
    if (externalRef) {
      queryConditions.push({ paydReference: externalRef })
      queryConditions.push({ externalRef: externalRef })
    }
    if (internalRef) {
      queryConditions.push({ apiRef: internalRef })
    }

    let deposit = await Deposit.findOne({ $or: queryConditions })

    if (!deposit) {
      console.warn('⚠️ Deposit not found for Payd webhook:', { externalRef, internalRef })
      return res.status(200).json({ status: 'ok', message: 'Deposit not found' })
    }

    // Idempotency check: if already completed, do nothing
    if (deposit.status === 'completed') {
      console.log(`⚠️ Deposit ${deposit._id} already marked as completed. Skipping.`)
      return res.status(200).json({ status: 'ok', message: 'Already completed' })
    }

    if (isSuccess) {
      // Validate amount if present
      const rawAmount = payload.amount ?? payload.value ?? payload.data?.amount
      if (rawAmount !== undefined && rawAmount !== null) {
        const receivedAmount = Number.parseFloat(String(rawAmount))
        if (Number.isFinite(receivedAmount) && Math.abs(receivedAmount - deposit.amount) > AMOUNT_TOLERANCE) {
          console.error(`❌ Amount mismatch for deposit ${deposit._id}. Expected ${deposit.amount}, received ${receivedAmount}`)
          return res.status(200).json({ status: 'ok', message: 'Amount mismatch' })
        }
      }

      const mpesaReceipt =
        payload.third_party_trans_id ||
        payload.mpesa_receipt ||
        payload.receipt_number ||
        payload.data?.third_party_trans_id ||
        payload.data?.mpesa_receipt ||
        payload.data?.receipt_number ||
        null

      // Atomic status update to prevent race conditions
      const completedDeposit = await Deposit.findOneAndUpdate(
        { _id: deposit._id, status: 'pending' },
        {
          $set: {
            status: 'completed',
            paydReference: externalRef || deposit.paydReference,
            externalRef: externalRef || deposit.externalRef,
            mpesaReceipt: mpesaReceipt || deposit.mpesaReceipt
          }
        },
        { new: true }
      )

      if (!completedDeposit) {
        console.log(`⚠️ Deposit ${deposit._id} already transitioned from pending. Skipping balance increment.`)
        return res.status(200).json({ status: 'ok', message: 'Already processed' })
      }

      // Credit user balance atomically
      const user = await User.findByIdAndUpdate(
        completedDeposit.userId,
        { $inc: { balance: completedDeposit.amount } },
        { new: true }
      )

      if (!user) {
        console.error(`❌ User not found for deposit: ${completedDeposit._id}`)
        return res.status(200).json({ status: 'ok', message: 'User not found' })
      }

      console.log(`✅ Payd Deposit completed! User ${user.phone} credited KSH ${completedDeposit.amount}. New balance: ${user.balance}`)

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
    } else {
      // Payment failed or was cancelled by user
      const failureReason =
        payload.result_desc ||
        payload.message ||
        payload.error ||
        payload.data?.result_desc ||
        'Payment failed or cancelled'

      console.log(`ℹ️ Payd deposit failed/cancelled: ${deposit._id}, reason: ${failureReason}`)

      await Deposit.findOneAndUpdate(
        { _id: deposit._id, status: 'pending' },
        {
          $set: {
            status: 'failed',
            failureReason: String(failureReason)
          }
        }
      )
    }

    return res.status(200).json({ status: 'ok' })
  } catch (error: any) {
    console.error('❌ Payd Callback Error:', error)
    // Always return 200 OK to prevent webhook retry storms
    return res.status(200).json({ status: 'error_logged', error: error.message })
  }
}

// Keep intasendWebhook as transitional legacy fallback
export async function intasendWebhook(req: Request, res: Response) {
  try {
    console.log('📥 IntaSend Webhook (Legacy) received:', JSON.stringify(req.body, null, 2))
    const { invoice_id, state, api_ref, value } = req.body || {}

    if (state !== 'COMPLETE') {
      return res.status(200).json({ received: true })
    }

    if (!api_ref) {
      return res.status(200).json({ received: true })
    }

    const pendingDeposit = await Deposit.findOne({ apiRef: api_ref, status: 'pending' })
    if (!pendingDeposit) {
      return res.status(200).json({ received: true, message: 'Deposit not found or already processed' })
    }

    const completedDeposit = await Deposit.findOneAndUpdate(
      { _id: pendingDeposit._id, status: 'pending' },
      {
        $set: {
          status: 'completed',
          intasendInvoiceId: invoice_id || pendingDeposit.intasendInvoiceId,
          intasendTrackerId: req.body?.id || pendingDeposit.intasendTrackerId
        }
      },
      { new: true }
    )

    if (!completedDeposit) {
      return res.status(200).json({ received: true })
    }

    const user = await User.findByIdAndUpdate(
      completedDeposit.userId,
      { $inc: { balance: completedDeposit.amount } },
      { new: true }
    )

    if (user) {
      const io = getIO()
      if (io) {
        io.to(`user:${completedDeposit.userId}`).emit('DEPOSIT_SUCCESS', {
          amount: completedDeposit.amount,
          newBalance: user.balance,
          depositId: completedDeposit._id.toString(),
          apiRef: completedDeposit.apiRef,
          timestamp: new Date().toISOString()
        })
      }
    }

    return res.status(200).json({ success: true })
  } catch (err: any) {
    console.error('❌ Legacy IntaSend Webhook error:', err?.message)
    return res.status(200).json({ received: true })
  }
}
