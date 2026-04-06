#!/bin/bash
# Backend dependencies installation script

echo "📦 Installing backend dependencies..."

npm install --save \
  express \
  cors \
  sqlite3 \
  better-sqlite3 \
  axios \
  socket.io \
  dotenv \
  bcryptjs \
  jsonwebtoken \
  express-validator

npm install --save-dev \
  @types/express \
  @types/cors \
  @types/better-sqlite3 \
  @types/bcryptjs \
  @types/jsonwebtoken \
  nodemon \
  tsx

echo "✅ Dependencies installed!"
