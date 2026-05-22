FROM node:22-alpine AS deps
WORKDIR /app
COPY apps/dashboard-web/package.json ./package.json
RUN npm install --no-audit --no-fund --legacy-peer-deps

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY apps/dashboard-web ./
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public 2>/dev/null || true
EXPOSE 3000
CMD ["node", "server.js"]
