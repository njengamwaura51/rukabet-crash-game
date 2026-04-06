# 🧪 Testing Guide - RukaBet Betting State Refactor

## 🚀 Quick Start

**Dev Server:** http://localhost:5175

## 🎯 Critical Tests to Run

### 1. **Bet Placement During WAITING Phase**
**Steps:**
1. Open http://localhost:5175
2. Wait for countdown (5 seconds)
3. Click "BET" button (green)

**Expected:**
- ✅ Balance deducts immediately (check top right)
- ✅ Button changes to gray "ACTIVE" 
- ✅ Button becomes disabled
- ✅ Amount shows on button

**If it fails:** Betting context not working

---

### 2. **Cash Out During FLYING Phase**
**Steps:**
1. Place a bet during WAITING
2. Wait for plane to take off
3. Let multiplier reach 2x-3x
4. Click "CASH OUT" button (orange)

**Expected:**
- ✅ Button immediately changes to gray "WAIT"
- ✅ Green popup appears showing win
- ✅ Balance increases (win = bet × multiplier)
- ✅ Bet appears in "MINE" tab (left sidebar)

**If it fails:** cashOut() action or state transition broken

---

### 3. **Queued Bet (Bet Next Round)**
**Steps:**
1. Wait until plane is FLYING
2. Click "BET NEXT" button (green)

**Expected:**
- ✅ Balance deducts immediately
- ✅ Button changes to red "CANCEL"
- ✅ Subtext says "Next Round"
- ✅ When plane crashes and new round starts, button auto-changes to gray "ACTIVE"

**If it fails:** Queue → Active transition broken

---

### 4. **Cancel Queued Bet**
**Steps:**
1. During FLYING, click "BET NEXT"
2. Immediately click red "CANCEL" button

**Expected:**
- ✅ Balance refunded
- ✅ Button returns to green "BET NEXT"
- ✅ No bet placed in next round

**If it fails:** cancelQueuedBet() not working

---

### 5. **Losing Bet (Plane Crash)**
**Steps:**
1. Place bet during WAITING
2. Let plane fly without cashing out
3. Wait for plane to crash

**Expected:**
- ✅ Button changes to green "BET" (ready for next round)
- ✅ Lost bet appears in "MINE" tab with red X icon
- ✅ Balance NOT refunded (bet lost)

**If it fails:** Crash transition not recording loss

---

### 6. **Auto Bet**
**Steps:**
1. Place a bet manually and cash out successfully
2. Toggle "Auto Bet" switch (bottom of panel) to ON
3. Let next round start

**Expected:**
- ✅ Bet automatically placed with same amount
- ✅ Button shows "ACTIVE" without clicking
- ✅ Auto-bet continues each round

**If it fails:** Auto-bet useEffect not triggering

---

### 7. **Auto Cashout**
**Steps:**
1. Place a bet during WAITING
2. Toggle "Auto Cash Out" to ON
3. Set multiplier to 2.00x
4. Let plane fly past 2.00x

**Expected:**
- ✅ Auto cashes out exactly at 2.00x
- ✅ Popup shows win
- ✅ Balance updates

**If it fails:** Auto-cashout useEffect not watching multiplier

---

### 8. **Registration Error Message**
**Steps:**
1. Click "Register" button (top right)
2. Enter invalid phone: `0123456789`
3. Click submit

**Expected:**
- ✅ Shows error: "ENTER SAFARICOM NUMBER" in green (#00C74D)
- ✅ NO number list below input field

**If it fails:** AuthModal validation not updated

---

### 9. **Deposit Real STK Push**
**Steps:**
1. Login/Register
2. Click "Deposit" button
3. Enter amount: 100
4. Enter valid Safaricom number: 712345678
5. Click "Deposit"

**Expected:**
- ✅ Message: "Initiating M-Pesa payment..."
- ✅ NO "demo mode" message
- ✅ Message: "STK Push sent! Check your phone..."
- ✅ Balance updates after 8 seconds

**If it fails:** DepositModal still has demo fallback

---

## 🐛 Common Issues & Fixes

### Issue: "Cannot find module '@/contexts/BettingContext'"
**Fix:** Run `npm run build` to ensure TypeScript paths resolve

### Issue: Bets not working at all
**Fix:** Check browser console for errors. Ensure BettingProvider wraps AviatorGame

### Issue: Button stuck in one state
**Fix:** Check `gamePhase` prop is being passed correctly to BetPanel

### Issue: Balance not updating
**Fix:** Verify `onBalanceChange` callback is wired in AviatorGame

### Issue: Queued bet doesn't activate
**Fix:** Check BettingContext useEffect is monitoring phase transitions

---

## 🎨 Visual Checks

**Button Colors:**
- Green (#00C74D): BET, BET NEXT
- Orange (#f59e0b): CASH OUT
- Red (#ef4444): CANCEL
- Gray (#374151): ACTIVE, WAIT

**Error Color:**
- Green (#00C74D): "ENTER SAFARICOM NUMBER"

---

## ✅ Full Test Pass Criteria

All 9 tests above must pass for betting system to be production-ready.

**Current Status:** ✅ Build successful, ready for testing
**Server:** http://localhost:5175 (running)
