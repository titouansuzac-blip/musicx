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
- **Lecteur audio** : play/pause, suivant/précédent, barre de progression cliquable, volume, muet.
- **Visualiseur 3D réactif** (Three.js) : grille de « pixels » (cubes instanciés) pilotée par un `AnalyserNode`. 3 styles : barres pixel, grille, tunnel.
- **Navigation** : sidebar (Bibliothèque, Playlists, Visualiseur, Paramètres), tiroir sur mobile.
- **Lecture en arrière-plan** : API Media Session (métadonnées + contrôles écran verrouillé).
- **Persistance** : morceau, position, volume, vue et préférences conservés (`localStorage`).
- **Démos hors-ligne** : 6 morceaux générés en temps réel par un séquenceur Web Audio (basse, arpège, nappe, batterie) — aucun fichier audio requis.
- **Import** : ajout de vos propres fichiers audio (via le bouton +).
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
        ├── app.js          # bootstrap : relie tout
        ├── player.js       # moteur Web Audio (génératif + fichier) + analyser
        ├── visualizer.js   # visualiseur 3D Three.js
        ├── library.js      # morceaux démo, playlists, import, pochettes
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
