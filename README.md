# 🎰 Tombola « Machine à sous » — Soirée casino du Nouvel An

Site web 100 % statique (HTML + CSS + JavaScript, sans dépendance, sans Internet) qui transforme la tombola en **fausse machine à sous**.
Le résultat de chaque ticket est **tiré au sort à l'avance** : la machine n'est que la mise en scène, et ses rouleaux affichent **toujours** le résultat prévu.

---

## 1. Ouvrir le site

1. Copiez le dossier complet sur l'ordinateur ou la tablette (clé USB, téléchargement…).
2. Ouvrez **`index.html`** dans le navigateur (double-clic). Aucune connexion Internet n'est nécessaire.
3. Navigateurs conseillés : **Chrome** ou **Edge** (Safari et Firefox fonctionnent aussi).

> ⚠ Ouvrez **toujours le même fichier, au même emplacement, dans le même navigateur** : les données sont enregistrées dans ce navigateur.
> N'utilisez pas la **navigation privée** (rien n'y est conservé).

### Téléphone / tablette : utilisez `tombola-casino.html`

Sur Android ou iPad, le gestionnaire de fichiers n'ouvre que le fichier HTML, **sans** le dossier `js/` ni `style.css` : la page s'affiche alors sans mise en forme et ne fonctionne pas.
Utilisez dans ce cas **`tombola-casino.html`** : c'est le site complet **dans un seul fichier** (identique à `index.html`). Il suffit de copier ce seul fichier sur l'appareil et de l'ouvrir avec Chrome.

> ⚠ Selon la façon dont le fichier est ouvert (adresse commençant par `content://`), le navigateur du téléphone peut refuser la sauvegarde automatique : un **bandeau rouge** l'indique.
> Ça suffit pour une démo. Pour la vraie soirée, utilisez de préférence un **ordinateur portable** (ouverture en `file://`, la sauvegarde automatique fonctionne), ou publiez le site sur GitHub Pages pour l'ouvrir en `https://`.

Après toute modification du code : `node tools/build-single.js` régénère `tombola-casino.html`.

Boutons discrets en haut à droite de la machine : 🔊 son · ⛶ plein écran · ⚙ administration (code PIN).

---

## 2. Présenter le concept (mode démo)

Au premier lancement, cliquez sur **« Découvrir le mode démo »** (ou *Réglages & sécurité → Lancer le mode démo*).

- 100 tickets et 5 lots fictifs, tirage déjà verrouillé : on peut jouer tout de suite.
- Bannière jaune **MODE DÉMO** visible en permanence.
- Stockage **séparé** : la vraie soirée n'est **jamais** touchée.
- Un ticket déjà joué est refusé, mais un bouton **« Rejouer (démo) »** permet de le rejouer.
- **↺ Réinitialiser la démo** remet tout à zéro en un clic ; **Quitter la démo** revient à la soirée.
- L'administration de la démo est accessible sans PIN (pour montrer les fonctions).

Idées de numéros à tester en démo : ouvrez *Administration → Tirage* pour voir le tableau complet (gagnants surlignés).

---

## 3. Configurer la vraie soirée

1. **⚙ Configurer la soirée** → choisissez un **code PIN** (4 à 8 chiffres, saisi deux fois). **Notez-le !**
2. Onglet **🎁 Lots & tickets** :
   - nombre total de tickets (numérotés de 1 à N) ;
   - ajoutez les lots : symbole (un symbole différent par lot), nom, quantité ;
   - les erreurs s'affichent en rouge (total des lots > nombre de tickets, symbole en double, nom manquant…) ;
   - **Enregistrer la configuration**.
3. Onglet **🎲 Tirage** :
   - un **seed** (graine) est proposé ; vous pouvez en saisir un ou cliquer sur **Nouveau seed** ;
   - **Générer le tirage** → le tableau complet ticket → lot s'affiche ;
   - même seed + même configuration = **exactement le même tirage** (vérifiable) ;
   - on peut régénérer autant de fois que l'on veut **tant que le tirage n'est pas verrouillé** ;
   - **✅ Test de cohérence** : bon nombre de gagnants par lot, aucun ticket avec deux lots, seed reproductible, rouleaux conformes ;
   - **🔒 Verrouiller le tirage** : la configuration devient non modifiable et le jeu s'ouvre.
4. Juste après le verrouillage :
   - **⬇ Export JSON** (copie du tirage, réimportable) et **⬇ Export CSV** (lisible dans Excel) ;
   - **🖨 Vue imprimable / Plan B** → imprimez la liste des gagnants par lot ;
   - **💾 Sauvegarder maintenant**.
5. Onglet **🔧 Réglages & sécurité** : titre affiché, effet « presque gagné » (activable, pourcentage réglable), délais de retour automatique, volume.

> L'effet « presque gagné » (2 symboles identiques sur 3) ne change **jamais** qui gagne : c'est uniquement de l'affichage, modifiable même après verrouillage.
> Un perdant n'obtient **jamais** trois symboles identiques.

---

## 4. Pendant la soirée

- Le participant donne son numéro → saisie sur le **pavé à l'écran** (ou au clavier) → **JOUER** (ou Entrée).
- Numéro hors plage → message d'erreur. Ticket déjà joué → **« Ce ticket a déjà joué ! »**.
- Gagné : 3 symboles identiques, **JACKPOT**, confettis, lumières, nom du lot et numéro du ticket.
- Retour automatique à l'accueil après quelques secondes (ou en touchant l'écran).
- La partie est enregistrée **avant** la rotation des rouleaux : recharger la page ne permet pas de rejouer.

**Erreur de saisie** (mauvais numéro entré) : *Administration → 📜 Journal → Annuler une partie*. Le ticket redevient « non joué » (il obtiendra le même résultat, fixé par le tirage) ; l'annulation reste tracée dans le journal.

**Tableau de bord** : tickets joués / restants, lots gagnés / restants par type, liste des lots déjà gagnés.

---

## 5. Sauvegardes

- **Automatique** : l'état (tirage, tickets joués, journal) est enregistré dans le navigateur après **chaque partie**.
- **Sur fichier** : **💾 Sauvegarder maintenant** télécharge un fichier `sauvegarde_tombola_AAAA-MM-JJ_HHhMM.json`. Copiez-le sur une clé USB ou un téléphone. Un rappel s'affiche en administration quand des parties ont été jouées depuis la dernière sauvegarde.
- **Restaurer** : *Tableau de bord* ou *Réglages → 📂 Restaurer une sauvegarde* (reprend tirage + parties + journal).
  *Tirage → 📂 Importer un tirage* recharge un export de tirage (les parties repartent de zéro).
  Le fichier est contrôlé à l'import (configuration, seed, cohérence).
- Le code PIN n'est pas inclus dans les fichiers : sur un nouvel appareil, créez un PIN puis restaurez.
- Si le stockage du navigateur est indisponible, un **bandeau rouge** l'indique : faites alors des sauvegardes sur fichier très souvent.
- Fermer ou recharger la page pendant la soirée déclenche un avertissement.

**Réinitialisation complète** (*Réglages → Zone dangereuse*) : code PIN + deux confirmations (dont la saisie du mot EFFACER). Option pour conserver la liste des lots.

---

## 6. Plan B (panne de l'appareil)

*Administration → 🖨 Plan B / vue imprimable → Imprimer* (option : tableau complet des tickets).

La feuille contient le seed, l'empreinte du tirage et, **pour chaque lot, la liste des numéros gagnants** avec une case à cocher « remis ».
En cas de panne : cherchez le numéro sur la feuille ; s'il y figure, il gagne le lot indiqué, sinon il est perdant.
Si la panne survient en cours de soirée, imprimez de préférence une nouvelle feuille de temps en temps (les tickets déjà joués y sont marqués « ✔ joué »), ou restaurez la dernière sauvegarde sur un autre appareil.

---

## 7. ✅ Check-list du jour J

**La veille / avant la soirée**
- [ ] Liste des lots et nombre de tickets définitifs saisis et **enregistrés**.
- [ ] Tirage généré, **test de cohérence ✅**, tirage **verrouillé**.
- [ ] Seed et empreinte notés sur papier.
- [ ] **Export JSON** du tirage + **sauvegarde** copiés sur une clé USB.
- [ ] **Plan B imprimé** (2 exemplaires), rangé avec les lots.
- [ ] Code PIN noté et connu de 2 personnes.
- [ ] Mode démo **quitté** (pas de bannière jaune).

**Sur place**
- [ ] Appareil branché sur secteur, mise en veille de l'écran **désactivée** dans les réglages du système.
- [ ] Son testé (*Réglages → Tester*), volume réglé pour la salle.
- [ ] **Plein écran** activé (bouton ⛶ ou touche F11).
- [ ] Un ticket test ? ➜ jouez-le puis **annulez la partie** dans le Journal.
- [ ] Lisibilité vérifiée à quelques mètres, à travers la découpe de la machine en carton.

**Pendant la soirée**
- [ ] **Sauvegarder maintenant** environ toutes les 30 minutes (ou dès que le rappel apparaît).
- [ ] Cocher sur le plan B les lots remis.

**Après la soirée**
- [ ] Sauvegarde finale + **export du journal** (CSV) pour l'archive.

---

## 8. Pour les curieux (technique)

```
index.html        écrans : jeu, administration, vue imprimable
tombola-casino.html  même site en un seul fichier (généré par tools/build-single.js)
style.css         thème casino, mise en page tablette/ordinateur, impression
js/draw.js        tirage à graine (cyrb128 + sfc32), validation, symboles des rouleaux, test de cohérence
js/storage.js     localStorage (soirée et démo séparées), fichiers
js/audio.js       sons générés avec la Web Audio API
js/ui.js          fenêtres modales, pavé PIN, notifications
js/slot.js        machine à sous : saisie, rouleaux, confettis
js/admin.js       administration, journal, plan B
js/app.js         état, modes, actions, import/export, plein écran, écran allumé
tests/            tests automatisés
```

- **Tirage** : mélange de Fisher-Yates des numéros 1..N avec un générateur pseudo-aléatoire à graine, puis attribution des lots dans l'ordre de la liste → un ticket gagne au plus un lot.
- **Rouleaux** : symboles finaux dérivés du seed et du numéro de ticket (gagnant = 3 × symbole du lot ; perdant = jamais 3 identiques).
- **Tests de la logique** (Node 18+, sans dépendance) : `node --test tests/*.test.js` — quantités, doublons, reproductibilité, jamais de triple pour un perdant, cas limites (1 ticket, tous gagnants, 0 lot, 1 lot, 1 000 et 10 000 tickets).
- **Test de l'interface** (facultatif, nécessite Playwright) : `node tests/ui/ui.e2e.mjs` — démo complète, ticket déjà joué, numéro invalide, rechargement, PIN, annulation, plan B, formats tablette portrait/paysage, ordinateur et téléphone.
- Limite : 10 000 tickets et 16 lots (un symbole par lot).
