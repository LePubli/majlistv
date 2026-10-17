# Dockerfile racine utilisé par DockPanel (Git Deploy) : construit l'API située dans ./api
FROM node:22-alpine
WORKDIR /app
# rclone : envoi des archives vers le fournisseur choisi (module « Stockage et archivage », étape S2).
RUN apk add --no-cache rclone
# npm ci (et non npm install) avec le fichier de verrouillage : on installe exactement les versions
# validées, y compris les correctifs de sécurité. Sans lui, le build réinstallerait ce qui passe et
# la version corrigée d'une dépendance ne serait pas garantie.
COPY api/package.json api/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY api/ .
USER node
EXPOSE 3000
CMD ["node", "src/index.js"]
