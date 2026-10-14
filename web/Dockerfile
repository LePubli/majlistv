# Dockerfile du front-end. Contexte de build = racine du dépôt (comme le Dockerfile de l'API).
FROM node:22-alpine AS build
WORKDIR /app
# npm ci : versions exactes du fichier de verrouillage (correctifs de sécurité inclus).
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
