# Audit BatiAzur Analyse — sécurité et accessibilité (v53, novembre 2026)

## 1. Audit de sécurité

### Problèmes trouvés et corrigés

| # | Gravité | Problème | Correction |
|---|---|---|---|
| S1 | **Élevée** | La clé Google (horaires du magasin) était écrite en clair dans `app.js`, donc lisible par n'importe qui et réutilisable sur le compte Google de Bati Azur. | Les horaires sont supprimés de l'app et la clé retirée du code. **À faire :** la clé reste dans l'historique GitHub (dépôt public) et sur l'ancienne copie GitHub Pages : il faut la supprimer (ou la régénérer) dans la console Google Cloud. |
| S2 | Moyenne | Actualités : un lien `javascript:` dans `actus.json` aurait pu être exécuté au clic, et la page d'administration était publique. | Les actualités sont supprimées de l'app publique (page, `actus.json`, `admin-actus.html`, Worker de publication). **À faire :** supprimer le Worker `batiazur-actus-worker` et son jeton GitHub dans Cloudflare/GitHub. |
| S3 | Moyenne | Plan de traitement : des noms de produits saisis par l'utilisateur étaient insérés dans la page sans être échappés. | Tout est échappé avant l'affichage. |
| S4 | Moyenne | Aucun en-tête de sécurité sur le site. | Fichier `_headers` : CSP stricte (scripts du site uniquement, pas de script en ligne), interdiction d'intégrer l'app dans une autre page (anti-clickjacking), HSTS, `nosniff`, `Referrer-Policy`, `Permissions-Policy`. Les scripts en ligne de `index.html` sont passés dans des fichiers (`sw-reset.js`, `register-sw.js`) pour être compatibles avec la CSP. |
| S6 | Faible | Le service worker mettait en cache toutes les réponses, y compris celles d'autres sites. | `/api/*` et les autres sites ne sont jamais mis en cache. |

### Comptes clients (nouveaux) — mesures en place
- Mots de passe : PBKDF2-SHA256, 100 000 itérations, sel aléatoire par compte. Aucun mot de passe en clair, nulle part.
- Sessions : jeton aléatoire de 256 bits ; seul son empreinte SHA-256 est stockée. Expiration 180 jours.
- Changer ou réinitialiser le mot de passe déconnecte tous les autres appareils.
- Essais limités : 8 connexions / 15 min par compte, 30 par adresse IP, 10 inscriptions par IP, 3 demandes de code et 5 essais de code.
- Même temps de réponse que le compte existe ou non (pas de détection d'adresses par chronométrage) ; « mot de passe oublié » répond pareil dans les deux cas.
- Pas de cookie : le jeton circule dans l'en-tête `Authorization` → pas d'attaque CSRF possible. Pas de CORS : aucun autre site ne peut appeler l'API.
- Données limitées (200 Ko, 100 bassins, 300 produits) ; erreurs génériques sans détail interne.
- Suppression du compte par l'utilisateur (RGPD).
- Lecture d'étiquette : la photo est lue sur le téléphone (Tesseract hébergé sur le site), elle n'est envoyée nulle part.

### Risques restants (acceptés ou à surveiller)
- Le jeton de session est stocké dans le navigateur (`localStorage`). La CSP stricte et l'échappement systématique limitent fortement le risque XSS qui permettrait de le voler.
- À l'inscription, le message « un compte existe déjà » révèle qu'une adresse est inscrite (choix courant pour la facilité d'usage ; limité à 10 essais / 15 min).
- `style-src 'unsafe-inline'` reste nécessaire (styles en ligne existants) : risque faible.

## 2. Audit d'accessibilité (référence WCAG 2.1 niveau AA)

| # | Critère | Problème | Correction |
|---|---|---|---|
| A1 | 1.4.4 Zoom | `user-scalable=no` empêchait d'agrandir l'écran. | Zoom réactivé ; les libellés passent à la ligne si le texte est agrandi. |
| A2 | 1.4.3 Contraste | Notes et libellés secondaires à 30 % d'opacité (≈ 2,5:1). Texte blanc sur bleu clair (≈ 3,6:1) dans les boutons et résultats. | Gris secondaires relevés (≈ 5,6:1) ; fonds bleus des boutons, puces et résultats assombris (≈ 5:1). |
| A3 | 2.4.7 Focus visible | Le focus clavier n'était pas visible. | Contour cyan de 3 px sur tous les éléments au clavier. |
| A4 | 4.1.3 Messages d'état | Les résultats de calcul n'étaient pas annoncés par les lecteurs d'écran. | Zones de résultat en `role="status"` / `aria-live` ; erreurs de formulaire en `role="alert"`. |
| A5 | 4.1.2 Nom, rôle, valeur | Les boutons de choix (forme, fond, paramètre, puces) n'indiquaient pas lequel était sélectionné ; onglet actif non signalé. | `aria-pressed` sur les choix, `aria-current="page"` sur l'onglet actif, barre en `<nav aria-label>`. |
| A6 | 1.1.1 Contenu non textuel | Icônes décoratives lues par les lecteurs d'écran. | `aria-hidden` sur toutes les icônes décoratives. |
| A7 | 2.4.3 Ordre du focus | Changer d'onglet laissait le focus sur l'ancienne page. | Le focus passe au titre de la nouvelle page. |
| A8 | 2.3.3 Animations | Animations imposées. | Désactivées si « Réduire les animations » est activé sur le téléphone. |
| A9 | 2.5.5 Cibles tactiles | Petites puces et liens < 40 px. | Hauteur minimale relevée. |
| A10 | 3.1 Lisible | Nombreux mots sans accents (« souhaite », « Sequestrant metaux »…) mal prononcés par la synthèse vocale. | Textes corrigés. |
| A11 | 1.3.1 Information | Unités des dimensions absentes. | Unités « (m) » ajoutées sur tous les champs de dimensions. |

Le guide de démarrage est une vraie fenêtre accessible (rôle `dialog`, focus maintenu dedans, Échap pour fermer, flèches ou balayage pour naviguer).

### Restant à faire (non bloquant)
- Thème clair (l'app est uniquement sombre).
- Vérification avec VoiceOver sur un iPhone réel.
