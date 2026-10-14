# Sauvegarde du VPS (étape 8)

Sauvegarde nocturne **chiffrée et hors du VPS** de : Mejliss TV (base + vidéos Garage), TriMaint (base), Miel & Compagnie (base MariaDB + sauvegardes DockPanel), config nginx et cron.
Stockage : hébergement mutualisé PlanetHoster, via SFTP (port 5022), avec [restic](https://restic.net) (chiffrement, déduplication, incrémental).

## Prérequis
- Ubuntu 24, Docker, `restic` (`apt install restic`), `curl`.
- Un hébergement avec accès SSH/SFTP et une clé publique autorisée (Hébergement > SSH > Ajouter une clé).
- Clé dédiée sur le VPS : `ssh-keygen -t ed25519 -f /root/.ssh/id_backup -N "" -C backup-vps`.

## Configuration
`/root/.ssh/config` :
```
Host n0c-backup
  HostName node228-eu.n0c.com
  Port 5022
  User yuxzzjad
  IdentityFile /root/.ssh/id_backup
  IdentitiesOnly yes
  ServerAliveInterval 30
  ServerAliveCountMax 6
```
`/root/.config/backup/env` (chmod 600) :
```
RESTIC_REPOSITORY=sftp:n0c-backup:/home/yuxzzjad/backups-vps/repo
RESTIC_PASSWORD=<à conserver AUSSI dans un gestionnaire de mots de passe>
# KUMA_PUSH_URL=https://<kuma>/api/push/<token>   (optionnel)
```
Initialisation unique : `set -a; . /root/.config/backup/env; set +a; restic init`.

## Installation
```bash
mkdir -p /root/backup && cp backup-vps.sh restore-test.sh /root/backup/ && chmod 700 /root/backup/*.sh
cp backup-vps.cron /etc/cron.d/backup-vps && chmod 644 /etc/cron.d/backup-vps
cp backup-vps.logrotate /etc/logrotate.d/backup-vps
```

## Lancement
- Manuel : `/root/backup/backup-vps.sh` (journal : `/var/log/backup-vps.log`, état : `/var/lib/backup-vps/last-status`).
- Première sauvegarde volumineuse (en arrière-plan) : `nohup /root/backup/backup-vps.sh > /var/log/backup-vps.first.log 2>&1 &`. Relançable sans perte en cas de coupure.
- Test de restauration (base restaurée dans un conteneur jetable) : `/root/backup/restore-test.sh` → doit finir par « TEST DE RESTAURATION REUSSI ». À faire chaque mois.

## Rétention
Dumps locaux : 3. Dépôt : 7 jours, 4 semaines, 6 mois. Purge physique + contrôle d'intégrité (3 %) le dimanche.

## Vidéos (Garage)
Base LMDB : le script exécute `/garage meta snapshot` (dans le conteneur) puis sauvegarde `garage/data` et `garage/meta/snapshots`. Restauration : arrêter le service storage, remettre `data/`, et copier le contenu du dernier snapshot dans `meta/` (le fichier `data.mdb`).

## Debug
- `restic snapshots`, `restic stats`, `restic check`.
- « connection lost » : relancer, restic reprend. L'option `-o sftp.connections=2` est déjà dans le script.
- Taille côté hébergement : `ssh n0c-backup 'du -sh /home/yuxzzjad/backups-vps/repo'`.
- Une base en échec ne bloque pas les autres ; l'état final est dans `last-status` et signalé à Uptime Kuma si `KUMA_PUSH_URL` est défini.

## Restaurer un fichier / un dump
```bash
set -a; . /root/.config/backup/env; set +a
restic snapshots
restic restore latest --target /tmp/restore --include /var/backups/vps-dumps
```

## Déploiement Uptime Kuma
Créer un moniteur de type « Push » avec intervalle 26 h, copier son URL dans `KUMA_PUSH_URL`.
