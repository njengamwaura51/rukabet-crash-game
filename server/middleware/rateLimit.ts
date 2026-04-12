import rateLimit from 'express-rate-limit'

export const adminRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, try again shortly' }
})
