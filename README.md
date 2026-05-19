# BatiAzur Analyse — V17

## Contenu
- `index.html` : structure de l'application
- `style.css` : design responsive + tabbar
- `app.js` : calculs volume, dosages et consignes d'application
- icônes PWA : favicon, Apple Touch Icon, Android Chrome
- `site.webmanifest`

## Nouveautés V2
- Nom final : BatiAzur Analyse
- Téléphone contact : 04 70 34 21 96
- Consignes d'application ajoutées dans les résultats :
  - tous les traitements : filtration 24 h obligatoire
  - TAC+ : verser directement dans l'eau en une seule fois, partie calme du bassin
  - pH : apports de 0,2, 20 minutes entre chaque, diluer dans un seau, verser devant les buses
  - chlore choc poudre/granulé : diluer dans un seau et verser autour du bassin
  - chlore choc pastilles : panier de skimmer
  - stabilisant : diluer puis verser dans le bassin
  - séquestrant métaux : directement dans l'eau
  - sel : directement dans l'eau du bassin
- Horaires : lien Google conservé en V2. Pas d'intégration API dans le code public pour éviter d'exposer une clé.

## Test local
Ouvrir `index.html` dans Safari ou Chrome.

Important : l'aperçu HTML dans ChatGPT peut bloquer JavaScript. Tester dans un vrai navigateur ou sur GitHub Pages.

## Mise en ligne GitHub Pages
1. Créer un dépôt GitHub, par exemple `batiazur-analyse`
2. Envoyer tous les fichiers du dossier à la racine du dépôt
3. GitHub > Settings > Pages
4. Source : `Deploy from branch`
5. Branch : `main` / root
6. Ouvrir l'URL GitHub Pages générée

## App iPhone
Depuis Safari :
1. Ouvrir l'URL GitHub Pages
2. Partager
3. Ajouter à l'écran d'accueil

## Modification V3
- Suppression de l'effet jaune sur la navbar/tabbar. On garde uniquement la bulle bleue qui se déplace.

## Modification V4
- Ajout d’un écran de lancement interne : fond bleu dégradé, icône de l’app, fondu, puis apparition de l’application.
- Cet effet fonctionne dans la webapp elle-même. Sur iPhone installé en PWA, l’écran natif de lancement dépend aussi du comportement iOS.

## Modification V5
- Correction iPhone 16 Pro Max en format vertical : suppression du bandeau blanc en haut.
- Passage du statut iOS en `black-translucent`.
- Ajout d'un fond derrière la safe-area / encoche.
- Le format horizontal reste inchangé.

## Modification V6
- Ajout d’une page Actualités accessible depuis l’accueil.
- Ajout d’une page Réseaux sociaux accessible depuis l’accueil.
- Ajout de `actus.json` pour alimenter les actualités.
- Ajout de `admin-actus.html` pour générer/modifier les actualités, ajouter images, boutons et liens de téléchargement.
- La tabbar reste à 3 onglets : Accueil, Volume, Dosage.

## Modification V7
- Ajout visible sur la page d'accueil :
  - lien Instagram
  - lien Avis Google
  - bouton Partager l'application
- Les liens sociaux sont aussi conservés dans la page Réseaux sociaux.

## Modification V8
- Lien Instagram officiel intégré : https://www.instagram.com/bati_azur03/
- Lien direct Avis Google intégré : https://g.page/r/CfwnXPUtWcjnEAE/review

## Modification V9
- Adresse magasin intégrée : Bati Azur, Les Cailles, route de Saint Ennemond, 03000 AVERMES
- Boutons d'itinéraire ajoutés :
  - Waze
  - Apple Plans
  - Google Maps

## Modification V10

## Modification V10
- Réseau social non souhaité retiré entièrement.
- Restent visibles : Instagram, Avis Google, itinéraire magasin.

## Modification V11
- Le bouton réseaux sociaux de l’accueil n’ouvre plus une page interne.
- Il ouvre directement Instagram : https://www.instagram.com/bati_azur03/
- La page réseaux sociaux interne a été retirée pour simplifier le parcours client.

## Modification V12
- Ajout du fichier `worker-cloudflare.js`.
- Ajout du guide `INSTALLATION-CLOUDFLARE.md`.
- `admin-actus.html` peut maintenant publier automatiquement `actus.json` sur GitHub via Cloudflare Worker.
- Paramètres GitHub confirmés :
  - Owner : batiazur-hub
  - Repo : batiazur-analyse
  - Branche : main

## Modification V13
- Reconstruction complète de `admin-actus.html`.
- Correction du chargement de la page admin.
- Page admin autonome, plus robuste et compatible mobile.

## Modification V14
- Ajout d'un bouton `Tester le Worker` dans admin-actus.html.
- Ajout d'un bloc diagnostic affichant le statut HTTP et la réponse brute du Worker.
- Permet d'identifier clairement si le problème vient de l'URL Worker, du mot de passe, du token GitHub, du nom du dépôt ou des permissions.

## Modification V15
- Ajout du dosage brome choc.
- Dosage : 150 g pour 10 m³.
- Formule : (volume / 10) × 150 g.
- Consigne : filtration 24 h obligatoire.

## Modification V16
- Ajout de la page Facebook officielle dans l'application.
- Lien intégré : https://www.facebook.com/profile.php?id=61589950888126&locale=ga_IE
- Facebook est accessible depuis l'accueil.

## Modification V17
- Ajout du bouton Facebook dans le bloc d’accueil “Suivre & donner un avis”.
