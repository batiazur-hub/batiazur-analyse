# Prévisionnel de ventes 2027 — Bati Azur

Classeur : **`Previsionnel_ventes_2027_BatiAzur.xlsx`**

Prévisionnel semaine par semaine (S01 à S52, semaines ISO 2027) et produit par produit
(192 références actives), établi à partir de l'export du détail des ventes de la caisse
du 01/01/2022 au 17/07/2026 (7 268 lignes).

## Contenu du classeur

| Feuille | Contenu |
|---|---|
| **Synthèse** | Trajectoire annuelle 2022→2027, scénarios bas/central/haut, CA prévisionnel par mois, top 15 produits, répartition par catégorie |
| **Qté 2027** | Quantités prévisionnelles : 192 produits × 52 semaines |
| **CA 2027** | CA TTC correspondant (quantité × prix unitaire modifiable) |
| **Historique hebdo** | CA hebdomadaire réel 2022-2026 vs prévisionnel 2027 + graphique |
| **Méthode et météo** | Hypothèses, méthode de calcul, volet météorologique, limites |

## Chiffres clés

- CA TTC réel : 38,8 k€ (2022) · 39,3 k€ (2023) · 50,9 k€ (2024) · 75,5 k€ (2025) · 59,1 k€ (2026 estimé)
- **Prévisionnel 2027 (scénario central) : ≈ 65,7 k€ TTC** — fourchette 55,9 k€ (météo défavorable) à 78,9 k€ (été type 2025)
- Pic de saison : semaines 20 à 26 (mi-mai → fin juin), ≈ 3 à 4 k€/semaine
- La saisonnalité hebdomadaire calculée sur 4,5 ans de ventes intègre l'effet météo moyen local (Avermes, Allier)

## Méthode (résumé)

1. Agrégation des quantités par produit × semaine ISO × année
2. Moyenne pondérée par récence (2022×0,4 → 2026×1,6 ; 2026 exclue au-delà de la semaine 28)
3. Lissage sur 3 semaines (25/50/25)
4. Calage sur la tendance annuelle (+11 %/an en moyenne 2022→2026)
5. Prix unitaires = médiane observée sur la dernière année de vente de chaque produit
