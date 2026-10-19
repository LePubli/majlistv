# Worker : conversion vidéo (FFmpeg -> HLS) et rendu des montages (étape E4a). Contexte de build : racine du dépôt.
FROM node:22-alpine
# font-dejavu : polices DejaVu Sans du système, utilisées par le rendu des montages (étape E4a) si /app/fonts manque.
RUN apk add --no-cache ffmpeg font-dejavu
WORKDIR /app
# npm ci : versions exactes du fichier de verrouillage (correctifs de sécurité inclus).
COPY worker/package.json worker/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY worker/src ./src
RUN mkdir /work && chown node:node /work
USER node
ENV NODE_ENV=production WORK_DIR=/work
EXPOSE 3000
CMD ["node", "src/index.js"]
