# Piano étoilé 🌟🎹

Application Web progressive (PWA) pour apprendre le piano avec les profils RockJam RJ361 (61 touches) et Schubert Etude 61 MKII (61 touches, toutes utilisables).

Ouvrir le site GitHub Pages sur Chrome Android, puis « Installer l'application » ou « Ajouter à l'écran d'accueil ».

**MIDI personnels :** ils ne sont pas publiés sur GitHub. Utiliser le bouton « Importer un MIDI (.mid) » dans l'application ; les morceaux sont sauvegardés localement sur l'appareil via IndexedDB. La détection sonore reste expérimentale et facultative.

Pour activer GitHub Pages : dépôt → Paramètres → Pages → Déployer à partir d'une branche → `main` → `/(root)` → Enregistrer. Le site prévu est `https://toxiquogame-oss.github.io/Piano-etoile/` (après activation).

Pour les mises à jour : remplacer les fichiers sur la branche `main`, incrémenter `APP_BUILD` dans `index.html`, changer la constante `CACHE` dans `service-worker.js`, puis actualiser l'application.

Numérotation affichée : le build 27 correspond à `V1.27`, 99 à `V1.99`, 100 à `V2`, 101 à `V2.1`, puis 200 à `V3`. Le titre, l’en-tête et le pied de page sont synchronisés à partir de `APP_BUILD`.

## V1.30 — écoute au casque

- Sélecteur Normal / Casque · sons faibles, conservé sur l’appareil. Le mode Casque réduit les seuils selon la sensibilité du micro, y compris lors de la calibration.
- La mesure du bruit de fond, la validation de fréquence et plusieurs trames successives restent nécessaires : le silence ne valide pas une note. Approcher une oreillette du micro, sans monter le volume à un niveau dangereux.
- Les profils et morceaux locaux ne sont pas effacés. La détection demeure expérimentale et ne peut pas reconnaître un casque inaudible pour le micro.

## V1.28 — entraînement et lumières

- Score local : notes correctes, erreurs, précision, série, progression et meilleur résultat par morceau, profil, main et passage. La mesure micro est expérimentale.
- Boucle : définir le début et la fin en secondes, puis jouer. La lecture recommence dans le passage jusqu'à la désactivation de la boucle. La durée affichée est celle du morceau jouable sur le profil choisi.
- Couleurs des deux mains et effet lumineux personnalisables, enregistrés sur l'appareil.
- Interface Web Bluetooth expérimentale pour ESP32, via Chrome Android sur HTTPS. Aucun partage de microphone ou de fichiers MIDI. Le ruban physique nécessite un firmware et un câblage adaptés, et n'a pas encore été testé.

### Protocole BLE Piano étoilé (à implémenter dans le firmware)

Service Nordic UART : `6e400001-b5a3-f393-e0a9-e50e24dcca9e`. Caractéristique RX écrivable : `6e400002-b5a3-f393-e0a9-e50e24dcca9e`. Publier le service dans l'annonce BLE. L'application sélectionne un périphérique exposant ce service.

- Trame de palette RGB (7 octets) : `[2, Rg, Gg, Bg, Rd, Gd, Bd]`.
- Trame de notes (20 octets) : `[1, premièreNoteMIDI, masqueGauche(8 octets), masqueDroite(8 octets), luminosité(5–30%), effet(0 fixe, 1 pulsation, 2 doux)]`. Bit i (LSB en premier) = touche MIDI premièreNoteMIDI + i, 0–60. Masques vides = éteindre toutes les touches. En mode apprentissage : notes restantes ; en mode automatique : notes actives.
- Le firmware devra convertir les indices de touches en positions physiques sur le ruban (selon la calibration), limiter le courant selon l'alimentation réelle et éteindre toutes les LED sur déconnexion ou absence prolongée de trames. Un plafond de luminosité dans l'interface ne remplace pas le dimensionnement de l'alimentation.
