# RukaBet Heroku Deployment Guide

## Prerequisites
- Heroku CLI installed (`brew install heroku/brew/heroku` or download from heroku.com)
- MongoDB Atlas account (free tier works)
- IntaSend account for M-Pesa payments

## Phase 1: MongoDB Atlas Setup

1. Go to [MongoDB Atlas](https://www.mongodb.com/atlas)
2. Create a free cluster (M0 Sandbox)
3. Create a database user with password
4. Add `0.0.0.0/0` to Network Access (for Heroku)
5. Get your connection string:
   ```
   mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/rukabet?retryWrites=true&w=majority
   ```

## Phase 2: Heroku Setup

### Create Heroku App
```bash
cd /home/pirate101/Downloads/aviator-crash-game-main
heroku login
heroku create rukabet-game
```

### Set Config Vars (Environment Variables)
```bash
# Required
heroku config:set NODE_ENV=production
heroku config:set MONGO_URI="mongodb+srv://user:pass@cluster.mongodb.net/rukabet?retryWrites=true&w=majority"
heroku config:set JWT_SECRET="your-secure-random-string-here"
heroku config:set ADMIN_TOKEN="your-admin-access-token"
heroku config:set FRONTEND_URL="https://rukabet-game.herokuapp.com"

# Optional (can be set via Admin Dashboard instead)
heroku config:set INTASEND_PUBLIC_KEY="ISPubKey_live_xxx"
heroku config:set INTASEND_SECRET_KEY="ISSecretKey_live_xxx"
heroku config:set INTASEND_CHALLENGE="117402"
heroku config:set PUBLIC_APP_URL="https://rukabet-game.herokuapp.com"
```

### Deploy
```bash
git add .
git commit -m "Prepare for Heroku deployment"
git push heroku main
```

### View Logs
```bash
heroku logs --tail
```

## Phase 3: IntaSend Webhook Configuration

After deployment, configure your IntaSend webhook:

1. Log into [IntaSend Dashboard](https://intasend.com)
2. Go to Settings → Webhooks
3. Add webhook URL: `https://rukabet-game.herokuapp.com/api/webhooks/intasend`
4. Enable "Payment Completed" events

> The backend credits balances only when a pending deposit reference and matching amount are verified on webhook completion. Ensure IntaSend points to the exact HTTPS webhook URL above.

## Phase 4: Verify Deployment

1. Open your app: `heroku open`
2. Test registration and login
3. Go to `/admin` and configure IntaSend keys
4. Test a deposit with sandbox credentials

## File Structure (Production)

```
aviator-crash-game-main/
├── dist/                    # Vite frontend build (served by Express)
├── dist-server/             # Compiled TypeScript server
├── server/
│   ├── indexProd.ts         # Production entry point
│   ├── db.ts                # MongoDB connection
│   ├── socketProd.ts        # Socket.IO with Heroku settings
│   ├── models/
│   │   ├── UserMongo.ts     # User schema
│   │   ├── BetMongo.ts      # Bet schema
│   │   ├── DepositMongo.ts  # Deposit schema
│   │   └── SettingsMongo.ts # Settings schema
│   └── controllers/
│       ├── authControllerMongo.ts
│       ├── depositControllerMongo.ts
│       ├── webhookControllerMongo.ts
│       └── settingsControllerMongo.ts
├── Procfile                 # Heroku process definition
├── package.json             # With heroku-postbuild script
└── tsconfig.server.json     # Server TypeScript config
```

## Key Heroku Configurations

### Socket.IO Settings (in socketProd.ts)
```typescript
{
  pingInterval: 25000,  // Prevents Heroku from dropping idle connections
  pingTimeout: 60000,   // Generous timeout for mobile networks
  transports: ['websocket', 'polling']
}
```

### Static File Serving (in indexProd.ts)
```typescript
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../dist')))
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(__dirname, '../dist/index.html'))
    }
  })
}
```

## Troubleshooting

### "Application Error" on Heroku
```bash
heroku logs --tail  # Check logs
heroku ps           # Check dyno status
heroku restart      # Restart the app
```

### MongoDB Connection Issues
- Ensure IP whitelist includes `0.0.0.0/0`
- Check MONGO_URI is correctly set
- Verify username/password are URL-encoded

### Socket.IO Disconnections
- Heroku's router has a 55-second timeout
- Our pingInterval (25s) keeps connection alive
- If issues persist, check client reconnection logic

## Local Development with MongoDB

```bash
# Start MongoDB locally or use Atlas
export MONGO_URI="mongodb://localhost:27017/rukabet"
npm run dev:server:mongo
```

## Production Checklist

- [ ] MongoDB Atlas cluster created
- [ ] MONGO_URI config var set
- [ ] JWT_SECRET is a strong random string
- [ ] ADMIN_TOKEN is secure
- [ ] IntaSend webhook configured
- [ ] SSL enabled (Heroku provides this)
- [ ] Test deposit flow works
- [ ] Test game betting works
- [ ] Monitor logs for errors
