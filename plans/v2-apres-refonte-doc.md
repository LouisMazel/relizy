# Plan : suites de la refonte de la doc v2

Suite de la refonte de la doc (commits `3253dea` docs et `269a2fb` test, novembre 2026). Les constats de la partie 4 viennent des agents qui ont confronté la doc au code : **chacun est à confirmer (lecture du code + test qui échoue) avant d'être corrigé**. S'il est faux, le rayer avec la raison.

Avant de démarrer : un autre agent corrige des bugs dans `src/` en parallèle, certains de cette liste le sont peut-être déjà. Lire `git log` depuis `269a2fb` et rayer ce qui est corrigé (avec le hash du commit) avant de toucher au code.

Règles de travail :

- Un commit par correction (`fix:`, `fix!:` si breaking, accord explicite pour un `!`), corps court avec un bloc de code de ce qui change, relu par `lint_commit`.
- Chaque fix a son test (unitaire, ou `*.git.spec.ts` quand le comportement passe par git) qui échoue avant et passe après.
- Lancer uniquement les specs touchés, le typecheck et le lint des fichiers changés ; la CI lance le reste.
- Mettre à jour la page de doc concernée dans le même commit quand le fix change ce qu'elle décrit (liens relatifs `./../x.md`). La doc décrit aujourd'hui le comportement actuel, bugs compris (`--pr-number` explicite, `GITLAB_TOKEN` requis, `publish.args` « non lu »...).
- `git add` des fichiers nommés puis `git commit` dans la même commande (un autre agent peut travailler dans le même dossier).

## 1. Références aux pages supprimées dans `src/`

Pages supprimées : `guide/installation`, `guide/twitter-integration`, `guide/slack-integration`, `guide/canary-releases`, `guide/prerelease-versioning`, `config/multiple-configs`, `commitlint/getting-started`.

- [x] ~~`src/commands/provider-release.ts:62` : le message d'erreur sans token pointe vers `https://relizy.dev/guide/installation#environment-setup`. Le remplacer par `https://relizy.dev/config/overview#tokens`. Commit `fix: point the missing token error to the tokens docs`.~~ Fait : `84d2ad5`.
- [x] Fait : `84d2ad5` (description) et `25c2ff1` (test des noms de pages de la description de `get_doc`, qui a trouvé `cli/commitlint`) `src/mcp/tools/get-doc.ts:86` : la description de l'outil cite `canary-releases` et `prerelease-versioning`. Remplacer par `prereleases`. Le test « MCP cites pages » ne le voit pas (pas de préfixe `guide/`) : élargir la regex de `citedDocIds()` dans `knowledge.spec.ts` aux noms de page nus listés dans les descriptions, ou y écrire les ids complets (`guide/prereleases`).
- [x] Fait : `c421e2a`. `src/mcp/__tests__/tools.git.spec.ts:522` : la recherche « snapshot release » attend `guide/canary-releases`. Passer à `guide/prereleases` (la page a « snapshot release » dans ses keywords).
- [x] Fait : `25c2ff1` (test : chaque lien `relizy.dev` de `src/` atteint une page et un titre existants). `grep -rn` dans `src/` des 7 ids supprimés et des URLs `relizy.dev/...` : vérifier que chaque URL citée par le code existe (pages et ancres). Idée de garde-fou : un test qui extrait les `relizy.dev/<id>` de `src/` et vérifie les ids dans le bundle.
- Un seul commit `fix:` pour les trois points s'ils restent petits, sinon `fix` (message d'erreur) + `test` (spec MCP).

## 2. `CONTRIBUTING.md`

Commit `docs: update the contributing guide` (inclus dans `guide/contributing`).

- [x] (`ec7fd01`) Node : « >= 20.0.0 » faux, c'est `^22.23.4 || ^24.22.1 || >=26.12.1` (engines de `package.json`).
- [x] (`ec7fd01`) Tests : « focus on `src/core/version.ts` » périmé. La couverture porte sur `src/**`, seuils dans `vitest.config.ts`. `pnpm test:unit` génère d'abord `agent-docs/`. Expliquer comment lancer un seul spec (`pnpm vitest run <fichier>`).
- [x] (`ec7fd01`) Hooks git : pre-commit lance seulement `lint-staged` (eslint --fix), pas de typecheck ; commit-msg lance `pnpm relizy commitlint --edit "$1"`.
- [x] (`ec7fd01`) Scopes d'exemple (`bump`, `publish`, `readme`, `git`, `version`) refusés : `relizy.config.ts` n'autorise que `docs`, `release`, `deps`. Rappeler qu'un commit sans scope est la norme ici.
- [x] (`ec7fd01`) Types de commit : ajouter `style`, `types`, `examples` (`getDefaultConfig`).
- [x] (`ec7fd01`) Arborescence : ajouter `init`, `pr-comment`, `commitlint`, `src/mcp/`, `agent-docs/`, `scripts/`, les specs `src/**/__tests__`.
- [x] (`ec7fd01`) Docs : `knowledge.spec.ts` échoue si une page citée par le MCP est renommée, si un flag CLI ou une clé de config manque sur sa page, si un `@default` diffère de `getDefaultConfig()`. Liens de la doc en `./../x.md`. `src/index.ts` liste l'API publique (`index.spec.ts`).
- [x] (`ec7fd01`) La règle `no-ai-attribution` bloque les commits co-signés par une IA.
- [x] (`ec7fd01`) Section « Adding a new AI provider », retirée de `docs/src/config/ai.md` (doc contributeur) : la réécrire ici à partir du registre des providers (`src/core/ai/`, `claude-code` et `ai-sdk`).
- [x] (`ec7fd01`) Contact `me@loicmazuel.com` : gardé, c'est l'e-mail du champ `author` de `package.json` (à confirmer par l'utilisateur).

## 3. Fixes reportés (prévus avant la refonte, dans le périmètre `src/` de l'autre agent)

- [x] Fait : `0e2c1a8`. **`capZeroMajor` en canary.** `planCanaryMode` (~`src/commands/bump.ts:535`) et `planCanaryIndependentMode` (~`:660`) appellent `determineSemverChange(commits, types)` sans `currentVersion` ni `capZeroMajor`, et mettent `'major'` en dur pour un peer cassant (~`:571`, `:660`). Conséquence : `0.5.2` + `feat!` donne `1.0.0-0.canary-<sha>`, alors que la release normale donne `0.6.0`. Corriger en passant par le même calcul que `determineReleaseType({ breakingPeer })` (capZeroMajor du groupe compris). Test : canary en 0.x avec `feat!` et avec un peer cassant, en unified et en independent. Doc : `guide/prereleases#canary-releases` (retirer la réserve sur 0.x). CLAUDE.md dit déjà « Same for the canary versions », le code doit le rejoindre.
- [x] Fait : `2be2f56`. **Options de `bump()`.** `bump()` (`src/commands/bump.ts:~1021-1039`) ne transmet que `yes`, `type`, `clean`, `preid`, `dependencyTypes` : `capZeroMajor` et `outOfRangePeers`, déclarés dans `BumpOptions`, sont ignorés. Les transmettre dans les overrides `bump`. Test : `bump({ capZeroMajor: false })` en 0.x donne un major. Doc : `api/bump.md` (les remettre dans la liste des options lues).
- [x] Fait : `2be2f56` (les champs ignorés sont transmis) et `1e8eb42` (`token` n'a plus qu'un sens, le token git). **Nettoyage de `ReleaseOptions`** (breaking du type, ok en v2). `ReleaseOptions extends ReleaseConfig, BumpConfig, ChangelogConfig, PublishConfig` expose des champs que `release()` ignore (`getReleaseConfig`, `src/commands/release.ts:36-86`) : `dependencyTypes`, `capZeroMajor`, `outOfRangePeers`, `includeCommitBody`, `packages`, `args`, `private`, `packageManager`, `safetyCheckTimeout`, `checkWorkspaceDependencies`. Et `token` a deux sens (token npm dans `PublishConfig`, token git dans `release()`). Décider : déclarer `ReleaseOptions` explicitement (les seuls champs lus) ou transmettre ceux qui ont du sens (`capZeroMajor`, `outOfRangePeers`, `includeCommitBody`). Renommer le token git (`gitToken` ?) ou documenter `publishToken` vs `token`. Commit `feat!:` ou `fix!:` après accord, entrée dans `guide/migration-v2.md` et `check_migration` si un champ public disparaît. Doc : `api/release.md` (liste « options ignorées » à retirer). La typedoc de `ReleaseOptions` (874 lignes) doit fondre.

## 4. Bugs relevés par la refonte (à confirmer un par un)

Priorité P1 : résultat faux sans avertissement. P2 : comportement surprenant ou option inefficace. P3 : cosmétique.

### Release et publication

- [x] Fait : `37942a5` (et `af2518a` pour son type). **P1 - `publish.args` jamais passé.** `getCommandArgs` (`src/core/npm.ts:~472`) n'utilise pas `config.publish.args`, la JSDoc (`src/types.ts:~766`) dit l'inverse et migration-v2 affirme que v1 les passait deux fois. Corriger : ajouter les args à la commande de publication (dédupliqués). Test : `--provenance` arrive dans la commande. Doc : `config/publish#args` (retirer « non lu »), mentionner la provenance npm dans `guide/ci-cd`.
- [x] Fait : `a7c9c3f` (un paquet qu'aucune entrée ne couvre part vers le registre de `.npmrc`). **P1 - `registries` sans registre par défaut inatteignable.** `resolveConfig` remplit toujours `publish.registry` depuis `.npmrc` (`src/core/config.ts:~232`), donc `skipEmptyDefault` (`src/core/npm.ts:~230`, `~266`) n'est jamais vrai et les paquets partent aussi vers le registre de `.npmrc`. Corriger : distinguer un
- [x] Fait : `706585e`. **P1 - Codes de sortie 0 en échec.** `providerRelease()` et `social()` renvoient leurs erreurs (`result.error`, `hasErrors`) au lieu de lever, et `src/cli.ts` (~226-276) ne les lit pas : `relizy provider-release` et `relizy social` en échec sortent en 0. Corriger dans les actions du CLI (sortir en 1). Test du CLI. Doc : `cli/commands#exit-codes`, `cli/social`.
- [x] Fait : `25aa365`. **P2 - `relizy publish --no-safety-check` ignoré.** `src/cli.ts:~195-221` ne passait pas `safetyCheck`. Probablement corrigé par `25aa365` : vérifier et rayer.
- [x] Fait : `50316d1`. **P2 - `relizy release --provider` sans effet sur la release.** L'étape provider release lit `config.repo?.provider` (`src/commands/release.ts:~459`) : `--provider` n'agit que sur la vérification de sécurité (~`:203`). Transmettre l'option. Test.
- [x] Fait : `afe4189` et `f95ea81` (provider des hôtes auto-hébergés). **P2 - `providerRelease()` ignore `repo.provider`.** Lancé seul, il ne lit que le remote `origin` (`src/commands/provider-release.ts:~178`) : un GitLab auto-hébergé dont l'URL ne contient pas « gitlab » échoue. Utiliser `config.repo.provider` d'abord. Test.
- [x] Fait : `d13954d`. **P2 - Vérification de `relizy publish` sautée.** `publishSafetyCheck` retourne si `release.publish` vaut `false` (`src/commands/publish.ts:~87`), y compris pour `relizy publish` lancé seul. Ne tester `release.publish` que dans `release`.

### Versions et options

- [x] Fait : `2be2f56`. **P2 - `changelog()` ignore `includeCommitBody`** (`src/commands/changelog.ts:~241-244`). Le transmettre. Test. Doc : `api/changelog.md`.
- [x] Fait : `a2ea161` (un seul helper `formatRepoTag()` pour le nom des tags). **P2 - Première occurrence seulement.** `changelogTitle` et `tagBody` passent par `.replace` (`src/core/changelog.ts:~90`, `~106`, `~125-128` ; `src/core/tags.ts:~747`) alors que `src/core/git.ts:~663` et les templates sociaux remplacent toutes les occurrences. Passer à `replaceAll`. Test. Doc : `config/commit-templates` (retirer la réserve).
- [x] Fait : `1d57afc`. **P3 - Options mortes.** `publish.packages` (`src/types.ts:~787`) et la clé racine `newVersion` (`src/types.ts:~1909`) ne sont lues nulle part. Les implémenter ou les retirer (`fix!:` avec entrée de migration et `check_migration`, comme `publish.private`). Doc : `config/publish`, `config/overview` (aujourd'hui « déclarées, non lues »).

### CI et providers

- [x] Fait : `61bfcb4` (`--pr-number` gardé dans la doc : toujours valable, et nécessaire après un merge). **P1 - Branche d'un `pull_request` GitHub.** `getCiBranch` (`src/core/ci.ts`) lit `GITHUB_REF_NAME`, qui vaut `123/merge` en `pull_request` (`GITHUB_REF_TYPE` vaut `branch`) : relizy fait `checkout -B 123/merge` et la détection de PR échoue. Lire `GITHUB_HEAD_REF` quand il est défini. Test unitaire des variables d'env. Doc : `guide/github-actions` (le canary sur PR passe aujourd'hui `--pr-number`, à garder ou alléger).
- [x] Fait : `815ded5` (releases via `JOB-TOKEN`, commentaire de MR refusé avec un message clair, d'après la doc GitLab du job token). **P1 - `CI_JOB_TOKEN` sur GitLab.** `tokens.gitlab` se rabat sur `CI_JOB_TOKEN` (`src/core/config.ts`), mais `src/core/gitlab.ts` et `src/core/pr-comment.ts` l'envoient dans l'en-tête `PRIVATE-TOKEN` : un job token passe par `JOB-TOKEN`, et l'API des notes de MR ne l'accepte pas. Envoyer `JOB-TOKEN` quand le token vient de `CI_JOB_TOKEN`, et pour le commentaire de MR, exiger un vrai token avec un message clair. Corriger le message de `gitlab.ts:~55` (« Set GITLAB_TOKEN or CI_JOB_TOKEN »). Vérifier dans la doc GitLab ce que le job token peut faire (releases : oui ? notes : non). Doc : `guide/gitlab-ci`, `guide/pr-comment#tokens`, `config/overview#tokens`.
- [x] Fait : `8cf5dbf` (PR du commit de départ de la release, sans PR ouverte de la branche). **P2 - Commentaire de PR après un merge.** La détection ne cherche que les PR ouvertes de la branche courante (`src/core/pr-comment.ts:~39`, `state=open&head=owner:branch`) : une release lancée par un push sur main ne trouve jamais la PR mergée, alors que le workflow généré donne `pull-requests: write`. Chercher la PR associée au commit (`GET /repos/{owner}/{repo}/commits/{sha}/pulls` sur GitHub, `merge_requests` du commit sur GitLab). Test. Doc : `guide/pr-comment`, `guide/github-actions#release-when-a-pull-request-is-merged`.
- [x] Fait : `f2d76ea` (vérifié : corepack n'est plus livré depuis Node 25, Node 26 est la LTS). **P2 - `corepack enable` sur `node:lts`.** Le job GitLab généré (`src/core/ci-workflow.ts`) l'utilise, et Node 25+ ne livre plus corepack (`node:lts` = Node 26 depuis octobre 2026). Vérifier ; installer pnpm autrement (`npm install -g pnpm@<version>` d'après `packageManager`). Test du YAML généré. Doc : `guide/gitlab-ci`.

### Posts sociaux et commentaire de PR

- [x] Fait : `9f0a11d`. **P2 - Slack, template + `summary` + une version.** `{{changelog}}` passe par `extractChangelogSummary` sans conversion en mrkdwn (`src/core/slack.ts`) : `**scope:**` et liens markdown arrivent bruts. Convertir comme les autres chemins. Test.
- [x] Fait : `a5fec87`. **P3 - Résumé sans IA.** `extractChangelogSummary` (`src/core/social.ts`) découpe par phrases : une puce terminée par « . » colle la suivante, et un « . » est ajouté en fin de tweet. Découper par lignes. Test. Doc : l'exemple sans IA de `guide/social-media`.
- [x] Fait : `4acda96` (la ligne d'une URL absente est retirée, plutôt qu'un nettoyage de toutes les lignes vides). **P3 - Double ligne vide.** Template Twitter par défaut sans `releaseUrl` (release `independent` seule) mais avec `changelogUrl`. Nettoyer les lignes vides consécutives après rendu. Test.
- [x] Fait : `be2b788` (le bloc garde les paquets absents des sections, ceux d'un groupe `selective`). **P3 - Paquets listés deux fois.** Post Slack multi-versions sans template : les paquets sont dans les sections puis dans le bloc « 📦 Packages ». Ne garder qu'un des deux. Test.
- [x] Fait : `518e880`. **P3 - `relizy pr-comment --dry-run`** renvoie `true` sans PR détectée. Renvoyer `false`. Test.

### Divers

- [x] Fait : `9320043`. **P3 - stderr sans `origin`.** `src/core/repo-config.ts:~91` : `execSync('git ... remote get-url')` sans `stdio`, `error: No such remote 'origin'` part sur stderr à chaque `relizy commitlint`. Code porté de changelogen : commit séparé, `stdio: ['ignore', 'pipe', 'ignore']`. Test.
- [x] Fait : `48364b1` (et tous les tirets longs de `src/`). **P3 - JSDoc fausses** (`src/types.ts`) : `safetyCheck` décrit « Skip safety check » alors que `true` active la vérification (~`:632`, `:689`, `:801`, `:1006`) ; ordre des variables d'env de `TokensConfig` (`RELIZY_*` est lu en premier, ~`:1566-1592`) ; tirets longs (~`:1123`, `:1484-1488`, plus « legacy behavior ») ; aide de `--publish-token` dans `src/cli.ts` (~`:202`, `:451`) : « only supported for pnpm and npm » alors que bun l'est aussi. Un commit `fix:` (la JSDoc alimente la typedoc et `get_config_option`).

### À trancher avec l'utilisateur (pas forcément des bugs)

- [x] Fait : `53f7229` (restaurées). `relizy release --canary --no-publish` laisse les versions canary dans les `package.json` (la restauration est dans l'étape publish). Restaurer aussi sans publish ?
- [x] Voulu (réponse de l'utilisateur), rien à changer. `success:release` ne s'exécute pas quand il n'y a rien à releaser. Voulu ? (Documenté tel quel dans `config/hooks`.)
- [x] Fait : `87f5800` (erreur claire). `[2, 'always']` sur une règle numérique de commitlint (`header-max-length`) donne `NaN` et la règle se tait. Le typage l'interdit : valider à l'exécution ?
- [x] Vérifié, pas de conflit : `--preview` est une option de la sous-commande, le `--no-preview` global est lu dans `argv` (`hasCliFlag`) ; `relizy commitlint --preview` affiche l'entrée, `--no-preview` ne gêne pas. Le flag global `--no-preview` et le flag `--preview` de `relizy commitlint` portent le même nom : vérifier qu'ils ne se gênent pas avec Commander.
- [x] Vérifié, la doc est juste : le code charge l'ESLint du projet et exige seulement que sa config analyse `CHANGELOG.md` (`calculateConfigForFile`), `@eslint/markdown` n'y est qu'un exemple de plugin. `changelogLinter: 'eslint'` : la doc cite `@eslint/markdown`, ou la config de la maison (`@maz-ui/eslint-config`) ?

Réponse de l'utilisateur :

- Oui faut le restaurer aussi sans publish.
- Voulu, pour éviter les erreurs de commande alors qu'il y a rien à faire.
- Non mettre une erreur claire
- @maz-ui/eslint-config et on fait un lien vers sa doc: [https://maz-ui.com/ecosystem/eslint-config](https://maz-ui.com/ecosystem/eslint-config) (c'est mon package, on fait de la pub)
