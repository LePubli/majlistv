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
mkdir -p /root/backup && cp backup-vps.sh restore-test.sh report-lib.sh /root/backup/ && chmod 700 /root/backup/*.sh
cp backup-vps.cron /etc/cron.d/backup-vps && chmod 644 /etc/cron.d/backup-vps
cp backup-vps.logrotate /etc/logrotate.d/backup-vps
```

## Lancement
- Manuel : `/root/backup/backup-vps.sh` (journal : `/var/log/backup-vps.log`, état : `/var/lib/backup-vps/last-status`).
- Première sauvegarde volumineuse (en arrière-plan) : `nohup /root/backup/backup-vps.sh > /var/log/backup-vps.first.log 2>&1 &`. Relançable sans perte en cas de coupure.
- Test de restauration : `/root/backup/restore-test.sh` → doit finir par « TEST DE RESTAURATION REUSSI ». **Automatique chaque lundi à 5 h 30** (cron, étape 37) ; état local : `/var/lib/backup-vps/restore-status`.
  Il restaure le dernier dump dans une base jetable (sans réseau), le compare à la production (échec si la sauvegarde a moins de 90 % des lignes), exige un dump de moins de 36 h, vérifie que les **vidéos** (instantané Garage + blocs) sont dans la dernière sauvegarde, et mesure la taille de la copie hors VPS.

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

## Suivi depuis le site (étape 37) — Admin → Santé du serveur
Après chaque sauvegarde nocturne et chaque test de restauration, le VPS envoie un court rapport (réussi/échec, nombre de sauvegardes, taille du dépôt, nombre de conférences retrouvées…) à `https://api-majlisstv.le-publicitaire.fr/backup/report`. Aucune donnée de membre n'est envoyée.
Le site affiche l'état (carte « Sauvegardes ») et **envoie un e-mail** aux destinataires de la santé du serveur si : la dernière sauvegarde a échoué, **ou si aucun rapport n'est arrivé depuis plus de 30 h** (VPS éteint, cron cassé…), ou si le test de restauration a échoué ou date de plus de 10 jours. Il envoie aussi un message au retour à la normale.

Activation (une seule fois), sur le VPS :
```bash
# 1. Fabriquer le jeton et le ranger dans le fichier de configuration (droits 600). NE PAS le coller dans une conversation.
TOKEN=$(openssl rand -hex 32)
cat >> /root/.config/backup/env <<EOF
MAJLIS_REPORT_URL=https://api-majlisstv.le-publicitaire.fr/backup/report
MAJLIS_REPORT_TOKEN=$TOKEN
EOF
chmod 600 /root/.config/backup/env
echo "$TOKEN"     # à copier dans Admin → Paramètres → Santé du serveur → « Sauvegardes : jeton des rapports du VPS », puis Enregistrer
```
```bash
# 2. Installer les scripts mis à jour (depuis le dossier ops/backup du dépôt) et le nouveau cron du lundi
cp backup-vps.sh restore-test.sh report-lib.sh /root/backup/ && chmod 700 /root/backup/*.sh
cp backup-vps.cron /etc/cron.d/backup-vps && chmod 644 /etc/cron.d/backup-vps
# 3. Premier test (envoie un rapport) ; la nuit suivante, la sauvegarde envoie le sien
/root/backup/restore-test.sh
```
Puis ouvrir Admin → Santé du serveur : la carte « Sauvegardes » doit montrer le test de restauration réussi. Pour provoquer une alerte d'essai : Paramètres → « Sauvegardes : alerte si aucune sauvegarde depuis » à 6 h (puis remettre 30).
Réglages (Paramètres → Santé du serveur) : jeton, délai maximal sans sauvegarde (30 h), délai maximal sans test de restauration (10 jours).

## Essai des scripts sans VPS
`bash ops/backup/tests/run-stub-test.sh` : de faux `docker` et `restic` simulent le serveur, un petit récepteur HTTP joue le site ; vérifie la réussite, l'échec (vidéos absentes, dump trop vieux, sauvegarde très en retard) et l'absence d'envoi sans jeton. Ne remplace pas un vrai passage sur le VPS.

## Restaurer pour de vrai (sinistre)
Voir `docs/RECONSTRUIRE-DE-ZERO.md` § 3. Vidéos : arrêter `majlistv-storage`, `restic restore latest --target /tmp/restore --include <dossier garage>/data --include <dossier garage>/meta/snapshots`, remettre `data/` en place et copier le contenu du dernier instantané dans `meta/`, relancer. **Garder `RESTIC_PASSWORD` et la clé `id_backup` ailleurs que sur le VPS** (gestionnaire de mots de passe) : sans eux, la copie hors VPS est inutilisable.
