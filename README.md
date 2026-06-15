# pulse.

Lecteur de musique **PWA** au style néo-brutaliste / pixel-art, avec
visualiseur **3D Three.js** réactif à la musique. Aucune étape de build :
des modules ES natifs servis en statique.

> Esthétique inspirée des références fournies (style « units. » d'awwwards) :
> fond quadrillé type papier millimétré, gros blocs de couleurs vives,
> typographie grotesque très grasse, et un motif pixel récurrent réutilisé
> pour les pochettes et le visualiseur.

## Fonctionnalités

- **Bibliothèque** : grille de cartes (titre, artiste, album, pochette pixel-art générée).
- **Recherche** : filtre instantané par titre, artiste ou album.
- **Lecteur audio** : play/pause, suivant/précédent, barre de progression cliquable, volume, muet.
- **Lecture aléatoire & répétition** : shuffle, et répétition off / toute la file / un seul morceau.
- **File d'attente** : panneau « À suivre » réorganisable par glisser-déposer, avec saut et retrait.
- **Animation de lancement** : takeover cinétique (grille en perspective, disque noir, titre géant qui pulse au rythme des basses, texte auto-ajusté) à chaque morceau lancé.
- **Vue lecture plein écran** : depuis le dock, écran immersif avec visualiseur géant, titre, progression et contrôles (Échap ou ▾ pour réduire).
- **Visualiseur 3D réactif** (Three.js) : grille de « pixels » (cubes instanciés) pilotée par un `AnalyserNode`, avec mapping logarithmique des fréquences, lissage par colonne (attaque/déclin) et pointes plus claires sur les aigus. 3 styles : barres pixel, grille, tunnel.
- **Navigation** : sidebar (Bibliothèque, Playlists, Visualiseur, Paramètres), tiroir sur mobile.
- **Lecture en arrière-plan** : API Media Session (métadonnées + contrôles écran verrouillé).
- **Persistance** : morceau, position, volume, vue, shuffle/repeat et préférences conservés (`localStorage`).
- **Démos hors-ligne** : 6 morceaux générés en temps réel par un séquenceur Web Audio (basse, arpège, nappe, batterie) — aucun fichier audio requis.
- **Import persistant** : ajout de vos fichiers audio via le bouton + ou par glisser-déposer ; les fichiers sont stockés en **IndexedDB** et survivent aux rechargements.
- **Installable** : manifest + service worker (app shell + Three.js mis en cache).

## Lancer en local

Un serveur statique suffit (les modules ES exigent HTTP, pas `file://`) :

```bash
python3 -m http.server 8099
# puis ouvrir http://localhost:8099/
```

Pour l'installer comme PWA, ouvrez le site et utilisez « Ajouter à l'écran d'accueil ».

## Structure du projet

```
musicx/
├── index.html              # structure, importmap (three), manifest
├── manifest.webmanifest    # métadonnées PWA + icônes
├── sw.js                   # service worker (cache hors-ligne)
├── vendor/
│   └── three.module.js     # Three.js vendorisé (fonctionne hors-ligne)
├── assets/icons/           # icônes PWA (192/512/maskable)
├── tools/
│   └── generate-icons.mjs  # génère les icônes PNG (sans dépendance)
└── src/
    ├── css/styles.css      # design system néo-brutaliste
    └── js/
        ├── app.js          # bootstrap : relie tout (file d'attente, modes…)
        ├── player.js       # moteur Web Audio (génératif + fichier) + analyser
        ├── visualizer.js   # visualiseur 3D Three.js
        ├── launch.js       # animation de lancement plein écran
        ├── library.js      # morceaux démo, playlists, import, pochettes
        ├── db.js           # stockage IndexedDB des fichiers importés
        ├── ui.js           # rendu DOM
        └── storage.js      # persistance localStorage
```

## Régénérer les icônes

```bash
node tools/generate-icons.mjs
```

## Prochaines étapes possibles

- Persistance des fichiers importés (IndexedDB) entre les sessions.
- Recherche / filtres dans la bibliothèque.
- File d'attente réorganisable et mode aléatoire / répétition.
- Réactivité plus fine du visualiseur (basses/médiums/aigus séparés).
