# Piano étoilé 🌟🎹

Application Web progressive (PWA) pour apprendre le piano avec les profils RockJam RJ361 (61 touches) et Schubert Etude 61 MKII (61 touches, toutes utilisables).

Ouvrir le site GitHub Pages sur Chrome Android, puis « Installer l'application » ou « Ajouter à l'écran d'accueil ».

**MIDI personnels :** ils ne sont pas publiés sur GitHub. Utiliser le bouton « Importer un MIDI (.mid) » dans l'application ; les morceaux sont sauvegardés localement sur l'appareil via IndexedDB. La détection sonore reste expérimentale et facultative.

Pour activer GitHub Pages : dépôt → Paramètres → Pages → Déployer à partir d'une branche → `main` → `/(root)` → Enregistrer. Le site prévu est `https://toxiquogame-oss.github.io/Piano-etoile/` (après activation).

Pour les mises à jour : remplacer les fichiers sur la branche `main`, incrémenter `APP_BUILD` dans `index.html`, changer la constante `CACHE` dans `service-worker.js`, puis actualiser l'application.

Numérotation affichée : le build 27 correspond à `V1.27`, 99 à `V1.99`, 100 à `V2`, 101 à `V2.1`, puis 200 à `V3`. Le titre, l’en-tête et le pied de page sont synchronisés à partir de `APP_BUILD`.
