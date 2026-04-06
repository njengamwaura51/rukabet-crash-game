# RukaBet Crash Game - Testing Checklist

## 🧪 Manual Testing Guide

### ✅ Core Features

#### 1. Game Canvas
- [ ] Plane animation smooth at 60fps
- [ ] NO green glow around takeoff area (clean look)
- [ ] Background rotation visible and smooth
- [ ] Multiplier increases smoothly during flight
- [ ] Crash animation plays correctly

#### 2. Betting System
**During WAITING Phase (Counter):**
- [ ] Click BET button → bet places immediately
- [ ] Balance deducts instantly
- [ ] Button shows "CASH OUT" once flying starts
- [ ] Manual amount input works (type numbers)
- [ ] Quick bet buttons work (10, 100, 1000, 10000)

**During FLYING Phase:**
- [ ] Click BET button → shows "CANCEL / Next Round"
- [ ] Balance deducts immediately (queued bet)
- [ ] After crash, queued bet becomes active next round
- [ ] Cancel button refunds queued bet

**Auto Features:**
- [ ] Toggle Auto Bet ON → automatically places last bet amount when WAITING starts
- [ ] Toggle Auto Cash Out ON + set 2.00x → cashes out at exactly 2.00x
- [ ] Both toggles work independently

#### 3. Deposits (M-Pesa)
- [ ] Click "Deposit" in header
- [ ] Enter phone: 712345678 (valid format)
- [ ] Enter amount: 100
- [ ] Click "DEPOSIT VIA M-PESA"
- [ ] See "STK Push sent!" OR "Demo mode" message
- [ ] Balance updates after 2-5 seconds
- [ ] Phone validation shows error for invalid formats

#### 4. Live Bets Sidebar
- [ ] Tab "ALL" shows bot bets with 6-char usernames (e.g., dk**29)
- [ ] Tab "MINE" shows personal bet history
- [ ] Tab "TOP WINS" shows leaderboard with gold badges
- [ ] Usernames are 6 characters long
- [ ] High-rollers (5,000-9,000 KSH) appear in list

### 🎯 New Retention Features

#### 5. Chat Panel
**Desktop (lg+):**
- [ ] Chat panel visible on right side (280px width)
- [ ] Type message and click Send
- [ ] Message appears in scrolling area
- [ ] Auto-scrolls to bottom on new message
- [ ] Shows "Live" badge with green pulse

**Mobile:**
- [ ] Green 💬 bubble visible bottom-right
- [ ] Click bubble → bottom sheet opens
- [ ] Type and send message
- [ ] Close sheet with X or swipe down

**System Messages:**
- [ ] When plane crashes, see orange message: "🚨 Plane crashed at X.XXx!"

#### 6. Provably Fair Modal
- [ ] "🔒 Provably Fair" button visible bottom-left of canvas
- [ ] Click button → modal opens
- [ ] See 3 seed fields (Server, Client, Result)
- [ ] Click copy icon next to each → "✓ Copied!" appears
- [ ] Seeds paste correctly from clipboard
- [ ] Current crash point displayed
- [ ] Close modal with X or "CLOSE" button

#### 7. Top Wins Leaderboard
- [ ] Click "TOP WINS" tab in sidebar
- [ ] See 8 top wins listed
- [ ] Each has gold rank badge (#1, #2, #3...)
- [ ] Multipliers high (40x+, 50x+)
- [ ] Win amounts calculated correctly
- [ ] Sorted by multiplier (highest first)

#### 8. Dynamic Canvas Animation
**Test at different multipliers:**
- [ ] 1.00x - 2.00x: Slow, steady rotation
- [ ] 5.00x - 10.00x: Rotation speed increases noticeably (3x)
- [ ] 15.00x+: Very fast rotation (5x), feels intense
- [ ] Ray brightness increases at high multipliers
- [ ] Smooth transition between speed tiers

### 📱 Responsive Layout

#### Desktop (1024px+)
- [ ] Live Bets sidebar on left (320px)
- [ ] Chat panel on right (280px)
- [ ] Game canvas in center
- [ ] Bet panels side-by-side (xl: 1280px+)
- [ ] No scrolling needed (fits in viewport)

#### Mobile (<1024px)
- [ ] Stacked vertical layout
- [ ] Game canvas at top
- [ ] Bet panels stack vertically
- [ ] Live Bets at bottom
- [ ] Green chat bubble bottom-right
- [ ] Page scrolls vertically
- [ ] All elements accessible

### 🔧 Technical Verification

#### Build Process
```bash
npm run build
# Should complete without errors
# dist/ folder created
# Files: index.html, assets/*.js, assets/*.css
```

#### Dev Server
```bash
npm run dev
# Server starts on http://localhost:5175
# Hot reload works
# No console errors
```

#### Browser Console
- [ ] No red errors in DevTools
- [ ] No warning spam
- [ ] Network requests succeed (or fallback gracefully)

### 🎨 Visual Polish

- [ ] Logo displays correctly (RukaBet)
- [ ] Green color: #00C74D used consistently
- [ ] Dark theme throughout (#0b0e11 background)
- [ ] Animations smooth (no jank)
- [ ] Text readable (proper contrast)
- [ ] Buttons have hover states
- [ ] Modals have backdrop blur

### 🔐 User Flow Test

1. **New User:**
   - [ ] Click "Register"
   - [ ] Enter phone, password
   - [ ] Register succeeds
   - [ ] See balance: 0.00
   - [ ] Freebet locked

2. **Deposit:**
   - [ ] Click "Deposit"
   - [ ] Enter 100 KSH
   - [ ] Complete deposit
   - [ ] Balance shows 100.00

3. **First Bet:**
   - [ ] Wait for "Waiting for next round"
   - [ ] Enter 25 KSH
   - [ ] Click BET
   - [ ] Balance now 75.00
   - [ ] Button shows "CASH OUT"

4. **Cashout:**
   - [ ] Wait until 2.00x
   - [ ] Click CASH OUT
   - [ ] See popup: "WON 50.00 KSH"
   - [ ] Balance updates to 125.00

5. **Check History:**
   - [ ] Click "MY BETS" tab
   - [ ] See the bet listed
   - [ ] Shows 2.00x multiplier
   - [ ] Shows +25 KSH profit

6. **Chat:**
   - [ ] Open chat
   - [ ] Send message: "Nice win!"
   - [ ] See message in list

7. **Verify:**
   - [ ] Click "Provably Fair"
   - [ ] See round seeds
   - [ ] Copy server seed
   - [ ] Paste confirms copied

## ✅ Definition of Done

All checkboxes above should be ✓ before considering the feature complete.

**Critical Path (Must Work):**
1. ✓ Betting during waiting phase
2. ✓ Cashout during flight
3. ✓ Balance updates correctly
4. ✓ Auto bet/cashout work
5. ✓ Responsive on mobile

**Nice-to-Have (Should Work):**
6. ✓ Chat messages send
7. ✓ Provably Fair modal opens
8. ✓ Top Wins displays
9. ✓ Dynamic animations

---

**Tester:** _________________  
**Date:** _________________  
**Browser:** Chrome / Firefox / Safari  
**Device:** Desktop / Mobile  
**Status:** ✅ PASS / ❌ FAIL
