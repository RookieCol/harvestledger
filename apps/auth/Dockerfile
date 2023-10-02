FROM node

WORKDIR /usr/src/app

COPY package*.json .

RUN npm install -g pnpm
RUN pnpm install

COPY . .
