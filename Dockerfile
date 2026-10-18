# ─── Stage 1: Build ───
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source files
COPY . .

# Build both frontend and backend
RUN npm run build

# ─── Stage 2: Production Runner ───
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy built assets from builder stage
COPY --from=builder /app/dist ./dist

# Create directory for persistent alert data
RUN mkdir -p /app/server/data

EXPOSE 3000

# Start production server
CMD ["node", "dist/server/index.js"]
