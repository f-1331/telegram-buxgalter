FROM node:22-alpine

WORKDIR /app

# Copy dependency files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy application files
COPY . .

# Expose web port
EXPOSE 3000

# Start bot
CMD ["npm", "start"]
