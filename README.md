# Application Horaires Trains

Application web de recherche d'horaires de trains TER/Fluo utilisant l'API Navitia.

## Structure des fichiers

| Fichier | Rôle |
|---------|------|
| `index.html` | Page principale - interface utilisateur (titre, formulaire de recherche, liste des résultats) |
| `script.js` | Logique frontend - gestion des événements, appels API, affichage des résultats |
| `server.js` | Serveur Express local - **même logique** que api/trains.js |
| `api/trains.js` | Fonction serverless Vercel - **même logique** que server.js |

### API locales vs production

**Attention**: Ces deux fichiers ont **la même fonctionnalité** (logique de recherche de trains). Seul l'environnement d'exécution change:

| Fichier | Environnement | Framework |
|---------|--------------|-----------|
| `server.js` | Local (`npm start`) | Express.js |
| `api/trains.js` | Vercel (production) | Serverless Functions |

**Pourquoi deux fichiers?**  
Vercel ne peut pas exécuter `server.js` directement. Il lit les fichiers dans le dossier `api/` et les transforme en fonctions serverless. La logique est identique dans les deux.
| `.env.local` | Variables d'environnement locales (clé API) - **non versionné** |
| `package.json` | Dépendances npm pour le serveur local |

## Fonctionnement

### Architecture

```
┌─────────────┐     ┌─────────────────┐     ┌─────────────┐
│   Navitia   │ ←── │  API (server.js │ ←── │  Frontend  │
│   (SNCF)    │     │   ou api/)      │     │ (script.js)│
└─────────────┘     └─────────────────┘     └─────────────┘
```

### Flux de données

1. **Utilisateur** saisit gare de départ, gare d'arrivée, date/heure
2. **Frontend** (`script.js`) appelle l'API avec ces paramètres
3. **API** interroge Navitia pour trouver les trajets
4. **Navitia** retourne les données brutes (horaires, correspondances, numéros de train)
5. **API** formate les données pour le frontend
6. **Frontend** affiche les résultats

### Développement local vs Production

| Environnement | Serveur | Fichier API |
|--------------|---------|-------------|
| Local | `node server.js` sur port 3000 | `server.js` |
| Vercel | Serverless Functions | `api/trains.js` |

Les deux utilisent **la même logique** pour traiter les données Navitia.

## Installation et lancement

### Prérequis
- Node.js installé
- Clé API Navitia

### Installation

```bash
npm install
```

### Lancement local

```bash
node server.js
```

Le site est accessible sur `http://localhost:3000`

### Configuration locale

Créer un fichier `.env.local` à la racine:
```
NAVITIA_TOKEN=votre_clé_api
```

## Déploiement sur Vercel

1. Pousser le code sur GitHub
2. Importer le projet sur Vercel
3. Ajouter la variable d'environnement `NAVITIA_TOKEN` dans les settings Vercel
4. Déployer automatiquement

## Commandes de versionnage

### Push mineur (corrections, petites améliorations)
- Exemple: v3.1 → v3.2
- Modifier la version dans `index.html`: `<small>v3.2</small>`
- Commit et push

### Push majeur (nouvelles fonctionnalités)
- Exemple: v3.1 → v4.0
- Modifier la version dans `index.html`: `<small>v4.0</small>`
- Commit et push

## Détails techniques

### Format des données Navitia

Navitia retourne les trajets avec:
- `departure_date_time` / `arrival_date_time` : horaires ISO (ex: "20260512T153500")
- `stop_date_times` : liste des arrêts avec horaires
- `display_informations.headsign` : numéro du train (ex: "831416")

### Formatage des heures

L'API convertit les horaires Navitia (20260512T153500) au format lisible (15:35).

## Résolution des problèmes

### Erreur 401 (token manquant)
- Vérifier que `.env.local` contient `NAVITIA_TOKEN`
- Sur Vercel, vérifier la variable d'environnement

### Erreur 404 (gare non trouvée)
- Vérifier l'orthographe des gares
- Navitia peut ne pas trouver certaines petites gares

### Pas de résultats
- Vérifier que la date/heure n'est pas dans le passé
- Certaines relations peuvent ne pas avoir de trains à certains horaires