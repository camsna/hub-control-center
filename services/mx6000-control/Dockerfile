FROM node:22-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --omit=dev

# Copy application code
COPY --chown=node:node . .

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3   CMD wget -q --spider http://127.0.0.1:3000/api/status || exit 1

# Run as non-root
USER node

CMD ["node", "server.js"]
