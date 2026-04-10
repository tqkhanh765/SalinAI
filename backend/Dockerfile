# ─── Stage: Production ────────────────────────────────────────────────────────
FROM node:20-alpine

# Metadata
LABEL maintainer="SalinAI Team"
LABEL description="SalinAI Backend — Node.js/Express + LangChain Agentic Core"

# Set working directory
WORKDIR /app

# Copy dependency manifests first (layer cache optimisation)
COPY package.json package-lock.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy the rest of the source code
# NOTE: node_modules and .env are excluded via .dockerignore
COPY . .

# The app listens on PORT (default 3001, overridable via env)
EXPOSE 3001

# Health-check so Docker / Render knows the container is ready
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/health || exit 1

# Use the non-root node user for security
USER node

# Start the server directly (no nodemon in production)
CMD ["node", "server.js"]
