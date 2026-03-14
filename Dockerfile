# Pharma DMS Backend – Node API
# Build: docker build -t pharma-dms-backend .
# Run:   docker run -p 4000:4000 -e DATABASE_URL=... -e JWT_SECRET=... pharma-dms-backend

FROM node:20-alpine

WORKDIR /app

# Install dependencies (layer cache when package.json unchanged)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy application code
COPY . .

# App reads PORT, DATABASE_URL, JWT_SECRET, etc. from env (Cloud Run / docker -e)
EXPOSE 4000

CMD ["npm", "start"]
