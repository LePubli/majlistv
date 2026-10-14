FROM node:22-alpine
WORKDIR /app
# npm ci : versions exactes du fichier de verrouillage (correctifs de sécurité inclus).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY . .
USER node
EXPOSE 3000
CMD ["node", "src/index.js"]
