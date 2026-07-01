FROM oven/bun:1.3.14-alpine AS deps

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM deps AS builder

WORKDIR /app

COPY . .
RUN bun run build

FROM oven/bun:1.3.14-alpine AS prod-deps

WORKDIR /app

COPY package.json bun.lock ./
RUN bun -e "const fs = require('fs'); const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')); if (pkg.scripts) delete pkg.scripts.prepare; fs.writeFileSync('package.json', JSON.stringify(pkg));"
RUN bun install --frozen-lockfile --production

FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV APP_ENV=production
ENV PORT=3000

COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./

USER node

EXPOSE 3000

CMD ["node", "dist/main.js"]
