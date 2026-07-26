FROM node:22-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY scripts/build.mjs ./scripts/build.mjs
RUN npm run build

FROM node:22-alpine

ENV NODE_ENV=production \
    MCP_HOST=0.0.0.0 \
    PORT=3000

WORKDIR /app
COPY --from=build /app/dist ./dist

USER node
EXPOSE 3000
CMD ["node", "dist/http.js"]
