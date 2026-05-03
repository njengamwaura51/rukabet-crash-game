---
name: testing-crash-game
description: Test the rukabet crash game frontend end-to-end. Use when verifying UI changes, bot users, error states, or alignment fixes.
---

# Testing the RukaBet Crash Game

## Dev Server Setup

1. `cd /home/ubuntu/repos/rukabet-crash-game && npm run dev`
2. Server runs on `http://localhost:<port>` (check output — port may vary, commonly 5175-5177)
3. The backend server (port 3001) is typically NOT running in test environments

## Key Constraints

- **No backend** = game phase stays "waiting" permanently. Bot cashout transitions (flying/crashed) and real betting cannot be tested.
- **Socket.io retries** in console are expected and can be ignored.
- **localStorage auth**: Registration creates a localStorage-based user. Sessions may not persist across VM restarts — re-register if needed.

## Registration

- Click Login → Register link in modal
- Use any 9-digit phone number (e.g. 712345678)
- Password must be 6+ characters
- Matching confirm password required
- Registration auto-logs in and grants KSH 150 freebet bonus

## Key Test Flows

### Bot Users (LiveBetsSidebar)
- Navigate to `/` — sidebar under "ALL" tab should show 5-12 bot user pills
- Each pill: username (Kenyan-flavored like "Brian_254", "Grace_pro"), bet amount, dash for multiplier
- Amounts should be varied (not all same) and sorted descending
- If names show "undefined" or amounts show "NaN", check `useBotBets.ts` seededRandom range

### Error Message Colors
- Navigate to `/profile`
- Enter mismatched passwords in Change Password form
- Error banner should be RED (text-red-400, bg-red-500/10), NOT green
- Also check `/deposit` modal error states if backend is available

### Glassmorphism Styling
- Check `/profile`, `/referrals`, `/bonuses` pages
- Cards should have: rounded-2xl corners, backdrop-blur-sm, thin borders (border-white/[0.06])
- Back button: rounded-xl with subtle hover effect
- Input fields: bg-white/[0.04] with focus:border-[#00C74D]/60

### AuthModal
- Login and Register modals should have glassmorphism styling
- Register modal shows "KSH 150 Freebet Bonus" info box at bottom
- The bonus box uses bg-[#00C74D]/[0.08] (bracket notation required for arbitrary opacity)

## Design System Reference

- Primary green: #00C74D / #00D455
- Dark background: #0b0e11 / #0a0a0a
- Glass cards: bg-[#151920]/90 with backdrop-blur-sm
- Borders: border-white/[0.06]
- Error states: RED (bg-red-500/10, text-red-400)
- Success states: GREEN (#00C74D family)
- Buttons: bg-gradient-to-b from-[#00D455] to-[#00A83D]

## Build Verification

```bash
npx tsc --noEmit  # TypeScript check — should be 0 errors
npm run build     # Vite production build — should succeed
```

## Devin Secrets Needed

No secrets required for frontend-only testing. Backend testing would require M-PESA API credentials if deposit flow needs verification.
