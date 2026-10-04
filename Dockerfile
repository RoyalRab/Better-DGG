# Stage 1: build the app icons from destiny.gg's icon with a REMIX tag.
FROM node:26-alpine AS icons
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY scripts ./scripts
COPY icon-src ./icon-src
COPY public ./public
RUN node scripts/make-icons.mjs

# Stage 2: the server.
FROM node:26-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY server.js CHANGELOG.md ./
COPY --from=icons /app/public ./public
USER node
CMD ["node", "server.js"]
