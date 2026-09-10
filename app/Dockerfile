FROM node:latest

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci

COPY . .

CMD ["npm", "run", "serve"]

EXPOSE 3001