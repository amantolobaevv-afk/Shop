FROM node:24-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --ignore-scripts
COPY --chown=node:node *.mjs ./
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node migrations ./migrations
COPY --chown=node:node seed-products.json ./
COPY --chown=node:node public ./public
USER node
EXPOSE 3000
CMD ["sh", "-c", "node scripts/migrate.mjs && node server.mjs"]
