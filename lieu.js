// =====================
// lieu.js — Fiche d'un lieu (pages générées par build-lieux.js)
// Gère : agrandissement des photos, mini-carte de situation
// (le menu burger est géré par script.js)
// =====================

(function () {
    // ---- Photos en grand
    var lightbox = document.getElementById('lightbox');
    var image = document.getElementById('lightboxImage');
    var dernierBouton = null;

    function ouvrir(src, bouton) {
        image.src = src;
        lightbox.hidden = false;
        document.body.style.overflow = 'hidden';
        dernierBouton = bouton;
        document.getElementById('lightboxClose').focus();
    }

    function fermer() {
        if (lightbox.hidden) return;
        lightbox.hidden = true;
        image.src = '';
        document.body.style.overflow = '';
        if (dernierBouton) dernierBouton.focus();
    }

    document.querySelectorAll('[data-photo]').forEach(function (bouton) {
        bouton.addEventListener('click', function () { ouvrir(bouton.dataset.photo, bouton); });
    });
    if (lightbox) {
        lightbox.addEventListener('click', function (e) {
            if (e.target !== image) fermer();
        });
    }
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') fermer();
    });

    // ---- Mini-carte (fond sombre, un seul point)
    var el = document.getElementById('ficheMap');
    if (!el || typeof L === 'undefined') return;
    var lat = parseFloat(el.dataset.lat);
    var lng = parseFloat(el.dataset.lng);
    if (isNaN(lat) || isNaN(lng)) return;

    var carte = L.map(el, {
        zoomControl: false,
        scrollWheelZoom: false,
        dragging: !L.Browser.mobile,
        attributionControl: true
    }).setView([lat, lng], 17);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=cb1_49bf_1_6cd23bb70be548965ad61a75', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(carte);

    L.marker([lat, lng], {
        icon: L.divIcon({
            className: 'pin-icon',
            html: '<span class="pin is-selected"><span class="pin-dot"></span></span>',
            iconSize: [18, 18],
            iconAnchor: [9, 9]
        }),
        keyboard: false,
        interactive: false
    }).addTo(carte);
})();
