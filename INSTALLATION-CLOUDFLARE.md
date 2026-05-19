# Installation Cloudflare Worker — BatiAzur Analyse

Objectif : publier `actus.json` automatiquement depuis `admin-actus.html`.

## 1. Créer le Worker Cloudflare

Cloudflare → Workers & Pages → Create Worker

Nom conseillé :

```text
batiazur-actus-worker
```

Copier le contenu du fichier :

```text
worker-cloudflare.js
```

dans l’éditeur du Worker, puis Deploy.

## 2. Variables Cloudflare

Dans le Worker :

```text
Settings → Variables
```

Créer ces variables :

```text
GITHUB_OWNER = batiazur-hub
GITHUB_REPO = batiazur-analyse
GITHUB_BRANCH = main
```

Créer ces secrets :

```text
GITHUB_TOKEN = token GitHub
ADMIN_PASSWORD = mot de passe admin de votre choix
```

Ne jamais mettre le token GitHub dans le code public.

## 3. Token GitHub

GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens

Réglages conseillés :

```text
Repository access : Only select repositories
Repository : batiazur-analyse
Permissions : Contents → Read and write
```

Copier le token une seule fois, puis le coller dans Cloudflare comme secret `GITHUB_TOKEN`.

## 4. Utilisation

Ouvrir :

```text
admin-actus.html
```

Renseigner :

```text
URL du Worker
Mot de passe admin
```

Créer les actualités puis cliquer :

```text
Publier sur GitHub
```

GitHub Pages peut prendre 1 à 3 minutes pour afficher la mise à jour.
