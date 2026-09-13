# Dockerfile API Intimakna TMS (NestJS + Prisma)
# Dipakai untuk Railway / Render / Fly.io / VPS.
FROM node:22-alpine

# Prisma butuh OpenSSL di Alpine
RUN apk add --no-cache openssl

WORKDIR /app

# 1) Dependensi
COPY package*.json ./
RUN npm ci

# 2) Prisma client (schema dulu agar cache optimal)
COPY prisma ./prisma
RUN npx prisma generate

# 3) Kode & build
COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 4000

# 4) Migrasi dijalankan saat start (aman: tidak menghapus data), lalu server
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
