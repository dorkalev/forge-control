# Use official Node.js runtime as base image
FROM node:18-alpine

# Set working directory in container
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Install system dependencies required for Claude Code CLI
RUN apk add --no-cache \
    git \
    curl \
    bash \
    libgcc \
    libstdc++ \
    ripgrep

# Set environment variable for Alpine Linux
ENV USE_BUILTIN_RIPGREP=0

# Install Claude Code CLI via npm
RUN npm install -g @anthropic-ai/claude-code

# Copy source code
COPY . .

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Change ownership of app directory (including entrypoint script)
RUN chown -R nodejs:nodejs /app
USER nodejs

# Expose port
EXPOSE 3000

# Use npm start which already includes migration
CMD ["npm", "start"]