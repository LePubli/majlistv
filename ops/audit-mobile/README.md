# Audit mobile et accessibilité (étape F)

Deux scripts Playwright (Python) qui parcourent les pages du site avec un « téléphone » et signalent les problèmes.

- `mobile_audit.py 390,360` : pour chaque page (visiteur, membre, organisateur, administrateur), signale **toute page plus large que l'écran** (c'est ce qui fait « dézoomer » la page sur un téléphone) et liste les éléments responsables.
- `axe_audit.py` : audit d'accessibilité (axe-core, règles WCAG 2 A/AA) des pages principales.

## Prérequis
```bash
pip install playwright psycopg2-binary requests && playwright install chromium
mkdir -p /var/tmp/axe && cd /var/tmp/axe && npm init -y && npm i axe-core@4.10.2
```
Une instance de test du site doit tourner (adresses `API`, `WEB` et identifiants en tête de chaque script : à adapter à votre environnement de test, **jamais la production**).

## Lancement
```bash
python3 mobile_audit.py 390,360     # affiche « ok » ou « WIDE » par page ; « LARGES: 0 » = rien à corriger
python3 axe_audit.py                # résumé par règle, gravité et page
```
Variables facultatives : `TID` (identifiant d'une conférence), `SER` (série), `COL` (collection) pour tester avec vos propres contenus longs.
