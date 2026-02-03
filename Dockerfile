# Use Node.js 20 slim image
FROM node:20-slim

# Install OpenSSL for Prisma
RUN apt-get update -y && apt-get install -y openssl

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy Prisma schema and generate client
COPY prisma ./prisma/
RUN npx prisma generate

# Copy the rest of the application code
COPY . .

# Expose the port the app runs on
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
