// =====================================================================
// i18n/ui.js — Textes de l'interface affichés par JavaScript (FR / EN)
// ---------------------------------------------------------------------
// Script classique, chargé avant les autres scripts de chaque page.
// Expose window.CJ :
//   CJ.lang                 'fr' | 'en' (d'après <html lang>)
//   CJ.t(cle, variables)    texte traduit, ex. CJ.t('lieux.count', { n: 3 })
//                           (une valeur { un, plusieurs } choisit selon n)
//   CJ.url(page, suffixe)   adresse d'une page dans la langue courante,
//                           ex. CJ.url('lieux', '?filtre=bars')
//   CJ.desc(lieu)           description du lieu (anglaise si dispo, sinon française)
//   CJ.descLang(lieu)       langue réelle de cette description ('fr' | 'en')
//   CJ.catNom(categorie)    nom de catégorie dans la langue courante
//
// Les textes des pages HTML sont traduits ailleurs (scripts/build-i18n.py).
// =====================================================================

(function () {
    var lang = (document.documentElement.lang || 'fr').slice(0, 2) === 'en' ? 'en' : 'fr';

    // Adresses des pages (absolues, valables depuis n'importe quel dossier)
    var PAGES = {
        fr: { accueil: '/', lieux: '/lieux.html', quartier: '/quartier.html', mag: '/mag.html', contact: '/contact.html' },
        en: { accueil: '/en/', lieux: '/en/places.html', quartier: '/en/neighbourhood.html', mag: '/en/mag.html', contact: '/en/contact.html' }
    };

    var TEXTES = {
        fr: {
            // Lieux : liste, carte, filtres
            'lieux.tout': 'Tout',
            'lieux.count': { un: '{n} lieu', plusieurs: '{n} lieux' },
            'lieux.chargementErreur': 'Impossible de charger les lieux. Réessaie plus tard.',
            'lieux.voirCarte': 'Voir sur la carte',
            'lieux.itineraire': 'Itinéraire',
            'lieux.fab.carte': 'Carte',
            'lieux.fab.liste': 'Liste',
            'lieux.fab.versListe': 'Revenir à la liste des lieux',
            'lieux.fab.versCarte': 'Voir les lieux sur la carte',
            'lieux.teaser.eyebrow': 'Carte interactive',
            'lieux.teaser.eyebrowCat': 'Carte interactive · {cat}',
            'lieux.teaser.titre': { un: '{n} lieu à explorer', plusieurs: '{n} lieux à explorer' },
            'lieux.teaser.aria': 'Explorer la carte interactive : {titre}',
            'lieux.locate.once': 'Me localiser',
            'lieux.locate.live': 'Suivre en direct',
            'lieux.locate.liveAria': 'Suivre ma position en direct',
            'lieux.locate.stop': 'Arrêter le suivi',
            'lieux.locate.refusee': "Localisation refusée. Autorise l'accès à ta position dans les réglages de ton navigateur pour utiliser cette fonction.",
            'lieux.locate.indisponible': 'Position indisponible pour le moment. Réessaie dans quelques instants.',
            'lieux.locate.delai': 'La localisation a mis trop de temps à répondre. Réessaie.',
            'lieux.locate.impossible': 'Impossible de te localiser pour le moment.',

            // Accueil
            'home.jour': "Aujourd'hui, je vais…",
            'home.soir': 'Ce soir, je vais…',
            'home.voirLes': 'voir les {n} →',
            'home.tirageVide': 'Le tirage n\'a rien donné cette fois. <a href="{url}">Parcours tous les lieux</a>.',
            'home.indisponible': 'Les lieux sont momentanément indisponibles. <a href="{url}">Réessayer depuis la page Lieux</a>.',
            'home.edition': 'N° {numero} — {saison} {annee}',
            'home.saison.automne': 'Automne',
            'home.saison.hiver': 'Hiver',
            'home.saison.printemps': 'Printemps',
            'home.saison.ete': 'Été',

            // Mag
            'mag.lienCopie': 'Lien copié dans le presse-papiers.',

            // Contact
            'contact.envoi': 'Envoi…',
            'contact.envoyer': 'Envoyer',
            'contact.ok': '✅ Message envoyé, merci ! On te répondra bientôt.',
            'contact.erreur': 'Une erreur est survenue.',
            'contact.reseau': '❌ Problème réseau, réessaie plus tard.',

            // PWA : aide à l'installation sur iPhone
            'pwa.titre': 'Installer Cours Ju',
            'pwa.etape1': 'Touche le bouton <strong>Partager</strong> {icone}<small>en bas de Safari, parfois derrière le menu « ⋯ »</small>',
            'pwa.etape2': "Choisis <strong>Sur l'écran d'accueil</strong>",
            'pwa.etape3': 'Confirme avec <strong>Ajouter</strong>',
            'pwa.fait': "C'est fait",
            'pwa.plusTard': 'Plus tard'
        },
        en: {
            'lieux.tout': 'All',
            'lieux.count': { un: '{n} place', plusieurs: '{n} places' },
            'lieux.chargementErreur': 'Places could not be loaded. Please try again later.',
            'lieux.voirCarte': 'See on the map',
            'lieux.itineraire': 'Directions',
            'lieux.fab.carte': 'Map',
            'lieux.fab.liste': 'List',
            'lieux.fab.versListe': 'Back to the list of places',
            'lieux.fab.versCarte': 'See the places on the map',
            'lieux.teaser.eyebrow': 'Interactive map',
            'lieux.teaser.eyebrowCat': 'Interactive map · {cat}',
            'lieux.teaser.titre': { un: '{n} place to explore', plusieurs: '{n} places to explore' },
            'lieux.teaser.aria': 'Explore the interactive map: {titre}',
            'lieux.locate.once': 'Find me',
            'lieux.locate.live': 'Live tracking',
            'lieux.locate.liveAria': 'Follow my position live',
            'lieux.locate.stop': 'Stop tracking',
            'lieux.locate.refusee': 'Location access denied. Allow location access in your browser settings to use this feature.',
            'lieux.locate.indisponible': 'Your position is unavailable right now. Please try again in a moment.',
            'lieux.locate.delai': 'Locating you took too long. Please try again.',
            'lieux.locate.impossible': 'We could not find your position right now.',

            'home.jour': 'Today, I’m off to…',
            'home.soir': 'Tonight, I’m off to…',
            'home.voirLes': 'see all {n} →',
            'home.tirageVide': 'Nothing came up this time. <a href="{url}">Browse all the places</a>.',
            'home.indisponible': 'Places are temporarily unavailable. <a href="{url}">Try again from the Places page</a>.',
            'home.edition': 'No. {numero} — {saison} {annee}',
            'home.saison.automne': 'Autumn',
            'home.saison.hiver': 'Winter',
            'home.saison.printemps': 'Spring',
            'home.saison.ete': 'Summer',

            'mag.lienCopie': 'Link copied to the clipboard.',

            'contact.envoi': 'Sending…',
            'contact.envoyer': 'Send',
            'contact.ok': '✅ Message sent, thank you! We’ll get back to you soon.',
            'contact.erreur': 'Something went wrong.',
            'contact.reseau': '❌ Network problem, please try again later.',

            'pwa.titre': 'Install Cours Ju',
            'pwa.etape1': 'Tap the <strong>Share</strong> button {icone}<small>at the bottom of Safari, sometimes behind the “⋯” menu</small>',
            'pwa.etape2': 'Choose <strong>Add to Home Screen</strong>',
            'pwa.etape3': 'Confirm with <strong>Add</strong>',
            'pwa.fait': 'Done',
            'pwa.plusTard': 'Later'
        }
    };

    function t(cle, vars) {
        var texte = (TEXTES[lang] && TEXTES[lang][cle]) || TEXTES.fr[cle] || cle;
        vars = vars || {};
        if (typeof texte === 'object') texte = vars.n > 1 ? texte.plusieurs : texte.un;
        return texte.replace(/\{(\w+)\}/g, function (m, k) {
            return vars[k] !== undefined ? vars[k] : m;
        });
    }

    function url(page, suffixe) {
        return (PAGES[lang][page] || PAGES[lang].accueil) + (suffixe || '');
    }

    function desc(lieu) {
        if (!lieu) return '';
        if (lang === 'en' && lieu.description_en) return lieu.description_en;
        return lieu.description || '';
    }

    function descLang(lieu) {
        return lang === 'en' && lieu && lieu.description_en ? 'en' : 'fr';
    }

    function catNom(cat) {
        if (!cat) return '';
        return (lang === 'en' && cat.nom_en) || cat.nom || '';
    }

    window.CJ = { lang: lang, t: t, url: url, desc: desc, descLang: descLang, catNom: catNom };
})();
