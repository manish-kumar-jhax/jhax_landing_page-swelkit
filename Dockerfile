# ---- build stage ----
FROM node:20-slim AS build
WORKDIR /app

# Install ALL deps (build needs vite/svelte/etc.)
COPY package*.json ./
RUN npm ci

# Build the adapter-node output (./build)
COPY . .
RUN npm run build

# Drop devDependencies so only runtime deps ship in the final image
RUN npm prune --omit=dev

# ---- runtime stage ----
FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
# Cloud Run injects PORT (default 8080). adapter-node reads PORT + binds 0.0.0.0.
ENV PORT=8080

COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json

EXPOSE 8080
CMD ["node", "build"]
