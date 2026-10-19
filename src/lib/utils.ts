import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatWhatsAppUrl(phone?: string): string {
  if (!phone || typeof phone !== 'string') return 'https://wa.me/254757567462'
  let digits = phone.replace(/\D/g, '')
  if (digits.startsWith('0') && digits.length === 10) {
    digits = '254' + digits.slice(1)
  } else if (digits.length === 9 && (digits.startsWith('7') || digits.startsWith('1'))) {
    digits = '254' + digits
  } else if (!digits.startsWith('254') && digits.length <= 10) {
    digits = '254' + digits.replace(/^0+/, '')
  }
  return `https://wa.me/${digits}`
}

