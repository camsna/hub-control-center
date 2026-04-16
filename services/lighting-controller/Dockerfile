FROM node:22-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm install --omit=dev

# Copy application files
COPY server.js ./
COPY effectEngine.js ./
COPY public ./public/

# Expose ports
EXPOSE 8081

# Run the server
CMD ["node", "server.js"]
