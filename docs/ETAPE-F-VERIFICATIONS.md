# Étape F — liste de vérification sur le VPS (E4a → E5c)

Préparée le 20/10/2026. À dérouler **une seule fois**, quand toutes les étapes de code sont déployées (décision d'Epok du 19/10 : les essais réels à partir d'E4 se font à la fin). Chaque ligne se coche (`[ ]` → `[x]`) ; en cas d'écart, copier le message affiché à Claude.
Les noms de conteneurs ci-dessous sont ceux déjà utilisés dans le README (`dockpanel-git-majlistv-*`, `dockpanel-app-postgres-majlisstv`). En cas de doute : `docker ps --format '{{.Names}}' | grep -i majlis`.

## 0. Avant de commencer
- [ ] Tout est poussé sur GitHub (GitHub Desktop : « Push origin » sans rien en attente).
- [ ] DockPanel → Git Deploy → Redeploy dans l'ordre : **majlistv-api**, **majlistv-web**, puis **majlistv-worker**, **transcriber** (et le service de doublage s'il a changé).
- [ ] Sur le VPS :
```
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/*majlisstv*
nginx -t && systemctl reload nginx
```
- [ ] Les migrations sont passées (la dernière de l'API et celles du module éditeur) :
```
docker logs dockpanel-git-majlistv-api 2>&1 | grep -i "migrat" | tail -15
```
- [ ] Une **conférence de test** non mise en avant existe (de préférence une vraie, d'environ 1 h, hébergée par Mejliss et non YouTube). Elle sert à tout ce qui suit.

## 0 bis. Contrôle automatique (à lancer d'abord)
Le script `ops/verify/verify-deploy.sh` fait en une minute les contrôles « mécaniques » des sections 0, 1 et 10 (conteneurs, ports réels et vhosts nginx, 7001 = TriMaint, santé, nginx, limites, migrations jusqu'à la 061, polices et filtres FFmpeg, yt-dlp, volumes, Garage, disque, sauvegarde, charge, journaux). Il ne modifie rien. Sur le VPS (à copier une seule fois) :
```
cd /root && curl -fsSL https://raw.githubusercontent.com/LePubli/majlistv/main/ops/verify/verify-deploy.sh -o verify-deploy.sh && chmod 700 verify-deploy.sh
bash /root/verify-deploy.sh
```
(si le dépôt est privé, copier le fichier à la main depuis GitHub Desktop vers le VPS). Résultat attendu : « 0 échec » ; copier à Claude toute ligne ÉCHEC ou ATTENTION. Les sections suivantes restent à faire à la main (essais à l'oreille, au navigateur, sur téléphone) : un script ne peut pas les juger.
- [x] `bash /root/verify-deploy.sh` → 0 échec (21/10, 13 h 22 : 60 OK, 0 échec, après correction du script, `apply-limits.sh` à jour et nettoyage du disque).

## 1. Worker : FFmpeg et polices (registre 18, 26)
```
docker exec dockpanel-git-majlistv-worker ls /usr/share/fonts/dejavu
docker exec dockpanel-git-majlistv-worker sh -c "ffmpeg -hide_banner -filters | grep -E ' (ass|amultiply|loudnorm|afftdn) '"
```
- [ ] La première commande liste des polices DejaVu ; la seconde affiche les 4 filtres `ass`, `amultiply`, `loudnorm`, `afftdn`.

## 2. Éditeur (E1) — registre 7, 5, 6
- [ ] Studio → Éditeur sur la conférence d'une heure : la timeline reste fluide (défilement, zoom, couper un extrait).
- [ ] Lecture de l'aperçu dans **Chrome, Firefox et Safari** (registre 5).
- [ ] Essai sur **téléphone** (iPhone notamment) et **tablette** (registre 6).

## 3. Son (E2) — registre 10, 11
- [ ] Lancer une analyse du son pendant que l'on surveille : `docker stats dockpanel-git-majlistv-api` (l'API ne doit pas ralentir de façon gênante ; registre 11).
- [ ] Essai à l'oreille « Sans / Avec réduction de bruit » sur une voix bruitée, réglage « légère » puis « forte » (registre 10) ; noter si c'est trop faible ou trop fort.

## 4. Image finale et habillage (E3) — registre 12, 14
- [ ] « Voir l'image finale » sur la vraie conférence : l'image n'est pas vide, les lettres arabes sont bien liées.
- [ ] Pendant 3 ou 4 images de suite : `docker stats` pour surveiller l'API (registre 14).

## 5. Rendu (E4a) — registre 18, 19
- [ ] Aperçu rapide d'un montage de 2–3 extraits : fichier produit, lisible.
- [ ] Rendu final de la conférence entière : noter le temps affiché (« calculé en … »), l'espace disque utilisé dans `/work`, la mémoire du worker :
```
docker stats --no-stream dockpanel-git-majlistv-worker
docker exec dockpanel-git-majlistv-worker df -h /work
docker logs dockpanel-git-majlistv-worker 2>&1 | grep -i rendu | tail -20
```
- [ ] « Regarder » puis « Télécharger » le fichier rendu dans un vrai navigateur (registre 19).

## 6. Remplacement de la vidéo (E4b) — registre 21
- [ ] Sur la conférence de test (jamais une conférence en service) : remplacer la vidéo, attendre la bascule, vérifier le lecteur, les sous-titres et la nouvelle transcription.
- [ ] « Restaurer l'original » : retour à l'état d'avant (vidéo, texte, version française).
- [ ] Le fournisseur de stockage d'archive (PlanetHoster) a bien reçu puis effacé la copie.

## 7. Montage par le texte (E5a, E5c) — registre 25, 28
- [ ] Nouvelle transcription de la conférence de test avec le vrai Whisper, puis onglet **Texte** : la page reste fluide avec environ 8 000 mots.
- [ ] Bouton **« Préciser la place des mots »** : la demande passe à « terminée » ; texte et traductions inchangés. Journal :
```
docker logs --tail 100 dockpanel-git-majlistv-transcriber 2>&1 | tail -40
```
  (si le nom diffère : `docker ps --format '{{.Names}}' | grep -i transcri`)
- [ ] Noter si l'absence du travail dans Studio → Activité gêne (registre 28).

## 8. Extraits 9:16 (E5b) — registre 26, 27
- [ ] Un extrait de 30 s : aperçu puis rendu final ; regarder le fichier (cadre, sous-titres bien placés, titre, police).
- [ ] Publier l'extrait en test sur Instagram, TikTok, YouTube Shorts : accepté ?
- [ ] Noter les cas où le conférencier sort du cadre (sert de cas d'essai pour l'étape E5d, « cadre qui suit le visage »).

## 9. Doublage — voix (D3) — registre 29
- [ ] Résultat de l'écoute du banc Qwen (voir `dubbing/d3bench/README.md`) enregistré et méthode retenue décidée.

## 9 bis. Doublage — intervenants et hauteur (D3c) — registre 41
- [ ] Transcripteur redéployé : le modèle de voix se télécharge (`/models/speakers/…onnx`, ~40 Mo) ; sinon le déposer à la main.
- [ ] Détection sur une VRAIE conférence à 2 voix (conférencier + question de la salle) : nombre d'intervenants juste ? sinon essayer `SPEAKER_THRESHOLD` 0,4 / 0,6. Idem avec une voix de femme ou d'enfant, et en arabe.
- [ ] Catégorie suggérée (homme/femme/enfant) cohérente avec ce qu'on entend.
- [ ] Hauteur : écouter −2, −1, +1, +2 sur une voix convertie ; noter la plage agréable. Vérifier `result.pitchEngine` = `rubberband` dans l'image du service de doublage (sinon la méthode de secours est utilisée : qualité à juger).
- [ ] Temps de calcul d'un doublage à plusieurs intervenants (conversion par intervenant) acceptable.

## 9 ter. Import de vidéos externes — registre 51
- [ ] Migration 061 appliquée (API redéployée) ; transcripteur et worker redéployés (ordre : api → web → worker → transcriber).
- [x] (21/10, 13 h 30) Lien archive.org direct vers un .mp4 (Big Buck Bunny, 9 min 56) : reconnu comme archive.org, copié et converti en 2 min (téléchargement → Garage → HLS), conférence hébergée, audio prêt, durée 596 s. Restent à confirmer à l'écran : lecture, mode audio, journal.
- [ ] Lien direct vers un petit fichier .mp4 public : Studio → Nouvelle conférence → coller le lien → cocher la déclaration → publier ; suivre dans Studio → Activité (téléchargement, conversion) ; la conférence devient lisible, mode audio disponible.
- [x] (21/10) Écran : lecture, mode audio et journal des imports vérifiés par Epok.
- [ ] Une conférence archive.org du catalogue → « Importer chez nous » : reste lisible pendant la copie, puis devient hébergée.
- [x] (21/10) Vimeo public, puis YouTube : importés depuis le VPS **sans cookies**.
- [x] (21/10) Annuler un import en cours : OK. Journal : OK. Relance d'un import en échec : OK sur le VPS (`ops/verify/test-import-retry.sh`, « TOUT EST OK », 21/10).
- [x] (21/10) Adresse interne (http://127.0.0.1:7001/…) refusée.
- [x] (21/10) Conférence de test « L'héritage des savants, une richesse à découvrir » (48 min, français, 2 voix, id e6ad96de-4744-43a6-86ae-13aa13ae7a7e) importée : **1 h 46** de la demande à la fin ; Garage 208 Mo → **3,6 Go** (≈ 3,4 Go pour cette seule conférence) ; disque du VPS 59 % ; transcription Whisper prête. Détail du temps et de la taille : à mesurer (registre 57).

## 10. Après tout
- [ ] `docker ps` : aucun conteneur en erreur ni redémarrant en boucle.
- [ ] Charge du VPS partagé acceptable pour Miel & Co et TriMaint (`uptime`, `docker stats --no-stream`).
- [ ] Mettre à jour `docs/PROBLEMES-A-REGLER.md` : passer en ✅ les points confirmés, noter les écarts.
