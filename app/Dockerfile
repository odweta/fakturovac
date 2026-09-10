FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci

RUN apt-get update \
	&& apt-get install -y --no-install-recommends fonts-dejavu \
	&& rm -rf /var/lib/apt/lists/*

COPY . .

CMD ["npm", "run", "serve"]

EXPOSE 3001