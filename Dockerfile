FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV PORT=3000

EXPOSE 3000

CMD ["npm", "run", "dev"]
