# Dockerfile for React/Vite Dashboard
FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy application code
COPY . .

# Expose port
EXPOSE 5173

# Run the development server (accessible from outside container)
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
