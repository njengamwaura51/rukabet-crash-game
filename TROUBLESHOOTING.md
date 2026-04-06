# Troubleshooting Blank White Screen

## Quick Fixes

### 1. Hard Refresh Browser
- Chrome/Firefox: Ctrl + Shift + R (Windows/Linux)
- This clears browser cache

### 2. Check Browser Console
1. Press F12 to open DevTools
2. Click Console tab
3. Look for red errors
4. Share screenshot of any errors

### 3. Verify Server Running
Terminal should show:
```
VITE v6.4.1  ready in XXXms
Local:   http://localhost:5175/
```

### 4. Try Different Browser
Test in Chrome, Firefox, or Edge

### 5. Clear Cache & Restart
```bash
cd /home/pirate101/Downloads/aviator-crash-game-main
npm run dev
```

Then hard refresh browser (Ctrl + Shift + R)

## Debug Commands

```bash
# Check server is responding
curl -s http://localhost:5175 | head -5

# Check for TypeScript errors
npx tsc --noEmit

# Rebuild from scratch
npm run build
```

## What to Share
1. Browser console errors (F12 → Console)
2. Terminal output from npm run dev
3. Browser name & version
