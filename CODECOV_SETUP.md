<!-- eslint-disable -->

# 📊 Codecov Setup Guide for Relizy

Ce guide vous explique comment finaliser la configuration de Codecov pour votre projet Relizy.

## ✅ Ce qui a été configuré automatiquement

Les fichiers suivants ont été créés/mis à jour :

- ✅ `codecov.yml` - Configuration Codecov optimale
- ✅ `.github/workflows/test-unit.yml` - Upload automatique vers Codecov
- ✅ `README.md` - Badge et documentation Codecov

## 🔧 Configuration requise (à faire manuellement)

### 1. Créer un compte Codecov et obtenir le token

1. **Aller sur [codecov.io](https://codecov.io)**
2. **Connectez-vous avec votre compte GitHub**
3. **Activez le repository `relizy`** :
   - Cliquez sur "+ Add new repository"
   - Cherchez "relizy" dans la liste
   - Cliquez sur "Setup repo"
4. **Copiez le CODECOV_TOKEN** :
   - Une fois le repo activé, Codecov affichera un token
   - Copiez ce token (format : `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`)

> **Note :** Pour un repository **public**, le token est optionnel mais recommandé pour éviter les rate limits.
> Pour un repository **privé**, le token est **obligatoire**.

### 2. Ajouter le token aux secrets GitHub

1. **Aller sur GitHub** : https://github.com/LouisMazel/relizy
2. **Cliquez sur "Settings"** (dans le menu du repository)
3. **Dans le menu de gauche, cliquez sur "Secrets and variables" > "Actions"**
4. **Cliquez sur "New repository secret"**
5. **Remplissez :**
   - **Name:** `CODECOV_TOKEN`
   - **Secret:** Collez le token copié de codecov.io
6. **Cliquez sur "Add secret"**

### 3. Mettre à jour le badge Codecov dans le README

Le badge Codecov nécessite un token d'upload différent pour l'affichage.

1. **Allez sur [codecov.io/gh/LouisMazel/relizy](https://codecov.io/gh/LouisMazel/relizy)**
2. **Cliquez sur "Settings" > "Badge"**
3. **Copiez le badge Markdown** qui ressemble à :
   ```markdown
   [![codecov](https://codecov.io/gh/LouisMazel/relizy/branch/main/graph/badge.svg?token=VOTRE_TOKEN_ICI)](https://codecov.io/gh/LouisMazel/relizy)
   ```
4. **Remplacez dans le README.md** la ligne :
   ```markdown
   <img src="https://codecov.io/gh/LouisMazel/relizy/branch/main/graph/badge.svg?token=YOUR_TOKEN_HERE" alt="codecov" />
   ```
   Par :
   ```markdown
   <img src="https://codecov.io/gh/LouisMazel/relizy/branch/main/graph/badge.svg?token=VOTRE_TOKEN_ICI" alt="codecov" />
   ```

> **Alternative :** Pour un repo public, vous pouvez utiliser le badge sans token :
>
> ```markdown
> <img src="https://codecov.io/gh/LouisMazel/relizy/branch/main/graph/badge.svg" alt="codecov" />
> ```

### 4. Tester la configuration

1. **Commitez et pushez les changements** :

   ```bash
   git add .
   git commit -m "feat(ci): add Codecov integration"
   git push
   ```

2. **Vérifiez le workflow GitHub Actions** :
   - Allez sur https://github.com/LouisMazel/relizy/actions
   - Vérifiez que le workflow "Unit Tests" s'exécute
   - Vérifiez que l'étape "Upload coverage to Codecov" réussit ✅

3. **Vérifiez le rapport sur Codecov** :
   - Allez sur https://codecov.io/gh/LouisMazel/relizy
   - Vous devriez voir les rapports de couverture
   - Explorez les fichiers, branches, et commits

### 5. Testez avec une Pull Request

1. **Créez une branche de test** :

   ```bash
   git checkout -b test/codecov-integration
   ```

2. **Faites un changement mineur** et commitez

3. **Créez une Pull Request** vers `main` ou `develop`

4. **Vérifiez que Codecov commente sur la PR** avec :
   - Le diff de couverture
   - Les fichiers modifiés
   - Les status checks

## 📋 Vérification finale

Voici la checklist pour s'assurer que tout fonctionne :

- [ ] Token CODECOV_TOKEN ajouté aux secrets GitHub
- [ ] Badge Codecov mis à jour dans le README
- [ ] Workflow GitHub Actions s'exécute sans erreur
- [ ] Rapports visibles sur codecov.io
- [ ] Codecov commente automatiquement sur les PRs
- [ ] Status checks affichés sur les PRs

## 🔍 Comprendre la configuration

### Codecov.yml

La configuration dans `codecov.yml` définit :

**Status Checks :**

- **Project** : Empêche une baisse globale de couverture > 0.5%
- **Patch** : Exige 80% de couverture sur le nouveau code

**Commentaires PR :**

- Diff de couverture
- Liste des fichiers modifiés
- Flags pour catégoriser les tests

**Flags :**

- `unit` : Pour tous les tests unitaires (src/)

**GitHub Checks :**

- Annotations ligne par ligne activées
- Aide à identifier rapidement le code non couvert

### Workflow GitHub Actions

Le workflow `.github/workflows/test-unit.yml` :

- S'exécute sur push vers `main` et `develop`
- S'exécute sur toutes les pull requests
- Upload automatique des rapports lcov vers Codecov
- Utilise le flag `unit` pour catégoriser

## 🎯 Optimiser la couverture

Actuellement, la couverture est limitée à 4 fichiers dans `vitest.config.ts`.

Pour étendre la couverture à tout le projet, modifiez la propriété `include` pour couvrir tous les fichiers TypeScript dans `src/`, et ajoutez les fichiers de tests et de types à `exclude`.

## Dépannage

### Le workflow échoue avec "Error uploading coverage"

**Cause** Token manquant ou invalide

**Solution :**

1. Vérifiez que `CODECOV_TOKEN` existe dans les secrets GitHub
2. Vérifiez que le token est valide sur codecov.io
3. Regenerez le token si nécessaire

### Codecov ne commente pas sur les PRs

**Cause** Permissions insuffisantes

**Solution :**

1. Vérifiez que le workflow a `pull-requests: write` (déjà configuré)
2. Vérifiez que Codecov GitHub App est installée : https://github.com/apps/codecov

### Le badge n'affiche pas la couverture

**Cause** Token d'upload incorrect ou manquant

**Solution :**

1. Récupérez le bon token du badge depuis codecov.io
2. Mettez à jour le README avec le bon token
3. Pour un repo public, utilisez le badge sans token

## 📚 Resources

- [Documentation Codecov](https://docs.codecov.com/)
- [Configuration Codecov YAML](https://docs.codecov.com/docs/codecov-yaml)
- [Codecov GitHub Action](https://github.com/codecov/codecov-action)
- [Codecov Dashboard](https://codecov.io/gh/LouisMazel/relizy)

## 💡 Bonnes pratiques

1. **Ne committez jamais le token** dans le code
2. **Utilisez les secrets GitHub** pour stocker les tokens
3. **Configurez des status checks** pour bloquer les PRs qui baissent la couverture
4. **Ajoutez des tests** pour toute nouvelle fonctionnalité
5. **Consultez régulièrement** les rapports Codecov pour identifier les zones non couvertes

---

Voilà ! Une fois ces étapes complétées, Codecov sera pleinement opérationnel sur votre projet. 🎉
