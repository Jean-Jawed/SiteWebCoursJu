// =====================================================================
// grignote.js — Article « Le distributeur » (street food, snacks, tapas)
// ---------------------------------------------------------------------
// Chargé après mag.js (menu, progression, halo, partage). Gère :
//   - le clavier du distributeur (lettre + chiffre → la case tombe dans le bac),
//     le bouton « au hasard » et les clics sur les cases ;
//   - les envies, qui allument les cases correspondantes ;
//   - les tampons « J'ai goûté » et le ticket de la quête, gardés dans ce
//     navigateur (localStorage, rien n'est envoyé) ;
//   - la carte des dix-huit adresses.
// Sans JavaScript, les cases restent de simples liens vers les adresses.
// =====================================================================

(() => {
    const EN = window.CJ && CJ.lang === 'en';
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const CLE = 'cj.grignote.tampons';
    const TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=cb1_49bf_1_6cd23bb70be548965ad61a75';
    const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

    const T = EN ? {
        accueil: ['Feeling peckish?', 'Type a code'],
        lettre: (l) => [`Row ${l}`, 'Now a number'],
        dabord: ['Letter first', 'A, B, C or D'],
        tombe: (code, produit) => [`${code} · ${produit}`, 'Dropping…'],
        servi: (code, nom) => [`${code} · ${nom}`, 'Enjoy!'],
        hasard: ['Let’s see…', ''],
        aller: 'Go to it ↓',
        goute: 'Tasted',
        pasGoute: '—',
        envie: (n) => n === 1 ? '1 slot lights up: ' : `${n} slots light up: `,
        ou: ' or ',
        messages: [
            'The quest hasn’t started yet.',
            (r) => `A good start. ${r} slots left to taste.`,
            (r) => `You’re getting into it: ${r} to go.`,
            (r) => r === 1 ? 'Nearly there! Just one slot left.' : `Nearly there! Just ${r} slots left.`,
            'Quest complete. Eighteen stamps.'
        ]
    } : {
        accueil: ['Une petite faim ?', 'Tapez un code'],
        lettre: (l) => [`Rangée ${l}`, 'Puis un chiffre'],
        dabord: ['La lettre d’abord', 'A, B, C ou D'],
        tombe: (code, produit) => [`${code} · ${produit}`, 'Ça tombe…'],
        servi: (code, nom) => [`${code} · ${nom}`, 'Bon appétit !'],
        hasard: ['Voyons voir…', ''],
        aller: 'Y aller ↓',
        goute: 'Goûté',
        pasGoute: '—',
        envie: (n) => n === 1 ? '1 case s’allume : ' : `${n} cases s’allument : `,
        ou: ' ou ',
        messages: [
            'La quête n’a pas commencé.',
            (r) => `Bon début. Encore ${r} cases à goûter.`,
            (r) => `Vous prenez le rythme : plus que ${r}.`,
            (r) => r === 1 ? 'Presque ! Plus qu’une case.' : `Presque ! Plus que ${r} cases.`,
            'Quête accomplie. Dix-huit tampons.'
        ]
    };

    function track(name, params = {}) {
        if (typeof window.gtag === 'function') window.gtag('event', name, { article: 'grignote', ...params });
    }

    // Les dix-huit cases, par code
    const CASES = {};
    document.querySelectorAll('.slot').forEach(slot => {
        const code = slot.dataset.code;
        const article = document.querySelector(`.grignote[data-code="${code}"]`);
        CASES[code] = {
            code,
            slot,
            article,
            nom: slot.querySelector('.slot-lieu').textContent.trim(),
            produit: slot.querySelector('.sachet-nom').textContent.trim(),
            envies: (slot.dataset.envies || '').split(' ').filter(Boolean)
        };
    });
    const CODES = Object.keys(CASES);

    // =====================
    // L'écran et le clavier
    // =====================
    const ecran = document.getElementById('ecran');
    const bac = document.getElementById('bac');
    let lettre = null;
    let enCours = false;

    function afficher(lignes, erreur = false) {
        if (!ecran) return;
        const spans = ecran.querySelectorAll('.ecran-ligne');
        spans.forEach((s, i) => { s.textContent = lignes[i] || ''; });
        ecran.classList.toggle('is-erreur', erreur);
    }

    function initClavier() {
        document.querySelectorAll('.touche').forEach(t => {
            t.addEventListener('click', () => taper(t.dataset.touche));
        });
        // Au clavier de l'ordinateur aussi, quand la machine est à l'écran
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
            const k = e.key.toUpperCase();
            if (!/^[A-D1-6]$/.test(k)) return;
            const r = document.getElementById('distributeur').getBoundingClientRect();
            if (r.bottom < 0 || r.top > window.innerHeight) return;
            const touche = document.querySelector(`.touche[data-touche="${k}"]`);
            if (touche) {
                touche.classList.add('is-appui');
                setTimeout(() => touche.classList.remove('is-appui'), 120);
            }
            taper(k);
        });

        document.querySelectorAll('.slot-lien').forEach(a => {
            a.addEventListener('click', (e) => {
                e.preventDefault();
                distribuer(a.closest('.slot').dataset.code);
            });
        });

        document.getElementById('hasard')?.addEventListener('click', auHasard);
    }

    function taper(k) {
        if (enCours) return;
        if (/[A-D]/.test(k)) {
            lettre = k;
            afficher(T.lettre(k));
            return;
        }
        if (!lettre) {
            afficher(T.dabord, true);
            return;
        }
        const code = lettre + k;
        lettre = null;
        distribuer(code);
    }

    function auHasard() {
        if (enCours) return;
        const tampons = lireTampons();
        let choix = CODES.filter(c => !CASES[c].slot.classList.contains('is-dim'));
        const pasGoutes = choix.filter(c => !tampons.includes(c));
        if (pasGoutes.length) choix = pasGoutes;
        const code = choix[Math.floor(Math.random() * choix.length)];
        track('grignote_hasard', { code });

        if (reduceMotion) return distribuer(code);
        // Petite roulette sur l'écran avant de servir
        enCours = true;
        let n = 0;
        const tour = setInterval(() => {
            const c = CODES[Math.floor(Math.random() * CODES.length)];
            afficher([T.hasard[0], c]);
            if (++n >= 9) {
                clearInterval(tour);
                enCours = false;
                distribuer(code);
            }
        }, 80);
    }

    // =====================
    // La chute dans le bac
    // =====================
    function distribuer(code) {
        const c = CASES[code];
        if (!c || enCours) return;
        enCours = true;
        track('grignote_code', { code });

        Object.values(CASES).forEach(x => x.slot.classList.toggle('is-choisi', x === c));
        afficher(T.tombe(code, c.produit));

        const fin = () => {
            c.slot.classList.remove('is-vend', 'is-vide');
            servir(c);
            enCours = false;
        };

        const sachet = c.slot.querySelector('.sachet');
        if (reduceMotion || !sachet.animate || !bac) return fin();

        const depart = sachet.getBoundingClientRect();
        const arrivee = bac.getBoundingClientRect();
        const clone = sachet.cloneNode(true);
        clone.classList.add('sachet--chute');
        clone.style.cssText = `left:${depart.left}px;top:${depart.top}px;width:${depart.width}px;height:${depart.height}px;--c:${getComputedStyle(c.slot).getPropertyValue('--c')}`;
        document.body.appendChild(clone);
        c.slot.classList.add('is-vend', 'is-vide');

        const dy = arrivee.top + arrivee.height / 2 - (depart.top + depart.height / 2);
        const dx = arrivee.left + arrivee.width / 2 - (depart.left + depart.width / 2);
        const anim = clone.animate([
            { transform: 'translate(0, 0) rotate(0)' },
            { transform: 'translate(0, 6px) rotate(8deg)', offset: 0.35 },
            { transform: `translate(${dx * 0.3}px, ${dy * 0.5}px) rotate(40deg)`, offset: 0.6 },
            { transform: `translate(${dx}px, ${dy}px) rotate(95deg) scale(0.6)`, opacity: 0.9 }
        ], { duration: 900, easing: 'cubic-bezier(.5,0,.9,.6)' });
        anim.onfinish = () => { clone.remove(); fin(); };
    }

    function servir(c) {
        afficher(T.servi(c.code, c.nom));
        if (!bac) return;
        const sachet = c.slot.querySelector('.sachet').cloneNode(true);
        bac.innerHTML = '';
        const produit = document.createElement('div');
        produit.className = 'bac-produit';
        produit.style.setProperty('--c', getComputedStyle(c.slot).getPropertyValue('--c'));
        produit.append(sachet);

        const texte = document.createElement('div');
        texte.className = 'bac-texte';
        texte.innerHTML = `<p class="bac-code"></p><p class="bac-nom"></p>`;
        texte.querySelector('.bac-code').textContent = `${c.code} · ${c.produit}`;
        texte.querySelector('.bac-nom').textContent = c.nom;
        produit.append(texte);

        const lien = document.createElement('a');
        lien.className = 'bac-lien';
        lien.href = `#${c.article.id}`;
        lien.textContent = T.aller;
        lien.addEventListener('click', () => track('grignote_bac', { code: c.code }));
        produit.append(lien);

        bac.append(produit);

        // Sur mobile, le bac est sous la vitre : on le ramène à l'écran
        const r = bac.getBoundingClientRect();
        if (r.top < 60 || r.bottom > window.innerHeight) {
            bac.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
        }
    }

    // =====================
    // Les envies
    // =====================
    function initEnvies() {
        const boutons = [...document.querySelectorAll('.envie')];
        const result = document.getElementById('enviesResult');

        boutons.forEach(b => b.addEventListener('click', () => {
            const actif = b.getAttribute('aria-pressed') !== 'true';
            boutons.forEach(x => x.setAttribute('aria-pressed', String(x === b && actif)));
            const envie = actif ? b.dataset.envie : null;
            const trouves = [];
            Object.values(CASES).forEach(c => {
                const ok = !envie || c.envies.includes(envie);
                c.slot.classList.toggle('is-dim', !ok);
                c.slot.classList.toggle('is-lit', !!envie && ok);
                if (envie && ok) trouves.push(c);
            });
            if (!result) return;
            result.textContent = '';
            if (!envie) return;
            result.append(T.envie(trouves.length));
            trouves.forEach((c, i) => {
                if (i > 0) result.append(i === trouves.length - 1 ? T.ou : ', ');
                const a = document.createElement('a');
                a.href = `#${c.article.id}`;
                a.textContent = `${c.code} ${c.nom}`;
                result.append(a);
            });
            result.append('.');
            track('grignote_envie', { envie });
        }));
    }

    // =====================
    // Tampons et ticket de la quête
    // =====================
    function lireTampons() {
        try {
            const v = JSON.parse(localStorage.getItem(CLE) || '[]');
            return Array.isArray(v) ? v.filter(c => CASES[c]) : [];
        } catch (_) {
            return [];
        }
    }

    function ecrireTampons(liste) {
        try { localStorage.setItem(CLE, JSON.stringify(liste)); } catch (_) { /* navigation privée */ }
    }

    function initTampons() {
        document.querySelectorAll('.tampon-btn').forEach(b => {
            b.addEventListener('click', () => {
                const code = b.dataset.tampon;
                let liste = lireTampons();
                const ajout = !liste.includes(code);
                liste = ajout ? [...liste, code] : liste.filter(c => c !== code);
                ecrireTampons(liste);
                peindre(liste, ajout ? code : null);
                track('grignote_tampon', { code, ajout });
            });
        });
        document.getElementById('ticketRaz')?.addEventListener('click', () => {
            ecrireTampons([]);
            peindre([]);
        });
        peindre(lireTampons());
    }

    function peindre(liste, nouveau = null) {
        Object.values(CASES).forEach(c => {
            const goute = liste.includes(c.code);
            c.slot.classList.toggle('is-goute', goute);

            const btn = c.article?.querySelector('.tampon-btn');
            if (btn) btn.setAttribute('aria-pressed', String(goute));

            const head = c.article?.querySelector('.grignote-head');
            let tampon = head?.querySelector('.tampon');
            if (goute && head && !tampon) {
                tampon = document.createElement('span');
                tampon.className = 'tampon';
                tampon.setAttribute('aria-hidden', 'true');
                tampon.append(T.goute);
                const small = document.createElement('small');
                small.textContent = c.code;
                tampon.append(small);
                head.append(tampon);
            }
            if (!goute && tampon) tampon.remove();
            if (tampon && c.code === nouveau) tampon.classList.add('is-neuf');

            const ligne = document.querySelector(`#ticketLignes li[data-code="${c.code}"]`);
            if (ligne) {
                ligne.classList.toggle('is-goute', goute);
                ligne.querySelector('.t-etat').textContent = goute ? T.goute : T.pasGoute;
            }
        });

        const n = liste.length;
        const total = CODES.length;
        const reste = total - n;
        const totalEl = document.getElementById('ticketTotal');
        if (totalEl) totalEl.textContent = `${n}/${total}`;
        const msg = document.getElementById('ticketMessage');
        if (msg) {
            const M = T.messages;
            msg.textContent = n === 0 ? M[0] : n === total ? M[4] : n < 5 ? M[1](reste) : n < 11 ? M[2](reste) : M[3](reste);
        }
        const diplome = document.getElementById('diplome');
        if (diplome) diplome.hidden = n < total;
    }

    // =====================
    // La carte
    // =====================
    function initCarte() {
        const el = document.getElementById('grignoteMap');
        if (!el || typeof L === 'undefined') return;

        const map = L.map(el, { scrollWheelZoom: false, zoomSnap: 0.25 });
        L.tileLayer(TILE_URL, { subdomains: 'abcd', maxZoom: 20, attribution: TILE_ATTRIBUTION }).addTo(map);

        const SIZE = 26;
        const points = [];
        Object.values(CASES).forEach(c => {
            const a = c.article;
            const lat = parseFloat(a?.dataset.lat);
            const lng = parseFloat(a?.dataset.lng);
            if (Number.isNaN(lat) || Number.isNaN(lng)) return;
            const couleur = getComputedStyle(c.slot).getPropertyValue('--c').trim();
            const marker = L.marker([lat, lng], {
                icon: L.divIcon({
                    className: 'gm-marker-wrap',
                    html: `<span class="gm-marker" style="--c:${couleur}">${c.code}</span>`,
                    iconSize: [SIZE, SIZE],
                    iconAnchor: [SIZE / 2, SIZE / 2]
                }),
                keyboard: false
            }).addTo(map);
            marker.bindTooltip(c.nom, { direction: 'top', offset: [0, -SIZE / 2], className: 'gm-tooltip' });
            marker.on('click', () => {
                a.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
                track('mag_map_click', { stop: a.id });
            });
            points.push([lat, lng]);
        });

        if (points.length) map.fitBounds(points, { padding: [30, 30], maxZoom: 17 });
        window.addEventListener('resize', () => map.invalidateSize());
    }

    afficher(T.accueil);
    initClavier();
    initEnvies();
    initTampons();
    initCarte();
})();
