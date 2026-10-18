FROM node:22-alpine
WORKDIR /app
# rclone : envoi des archives vers le fournisseur choisi (module « Stockage et archivage », étape S2).
# ffmpeg : formes d'onde, niveau sonore et écoutes « réduction du bruit » de l'éditeur de montage (étape E2).
RUN apk add --no-cache rclone ffmpeg
# npm ci : versions exactes du fichier de verrouillage (correctifs de sécurité inclus).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY . .
USER node
EXPOSE 3000
CMD ["node", "src/index.js"]
