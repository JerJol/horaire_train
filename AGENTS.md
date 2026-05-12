# Instructions pour l'agent

## Commandes de versionnage

### Push mineur
- Incremente le dernier chiffre
- Exemple: 3.1 → 3.2
- Utiliser pour: petites corrections, améliorations

**Étapes:**
1. Modifier la version dans `index.html` (dernier chiffre +1)
2. Commit avec message "vX.Y - Description" en incluant les fichiers modifiés (index.html, api/trains.js, script.js, server.js...)
3. Git push

### Push majeur
- Incrémente le premier chiffre et remet le dernier à 0
- Exemple: 3.1 → 4.0
- Utiliser pour: nouvelles fonctionnalités importantes

**Étapes:**
1. Modifier la version dans `index.html` (premier chiffre +1, dernier = 0)
2. Commit avec message "vX.0 - Description des changements majeurs"
3. Git push

## Déploiement

### Local
- Lancer: `node server.js`
- Le site est sur http://localhost:3000
- Utilise `.env.local` pour la clé API

### Vercel
- Variables d'environnement: ajouter `NAVITIA_TOKEN` dans les settings Vercel
- Le code dans `api/trains.js` est utilisé automatiquement

## Instructions utilisateur à appliquer

1. Pour chaque modification de code: mettre à jour la version
2. Toujours commit et push après modification
3. Avant de modifier: lire la version actuelle dans index.html
4. Ne pas inventier - suivre exactement ces instructions