// =====================================================================
// concerts.js — Article « Branchés » (salles de concert)
// ---------------------------------------------------------------------
// Complète mag.js (nav, progression, halo, partage). Gère :
//  - le câble, d'un seul tenant de l'ouverture à la dernière scène, qui se
//    déroule au fil de la lecture (les LED s'allument quand il atteint une prise) ;
//  - l'aide au choix « Ce soir, j'ai envie… » qui allume les prises du sommaire ;
//  - la carte des scènes (Leaflet), à partir des data-lat / data-lng.
// Sans JavaScript, la page reste entièrement lisible.
// =====================================================================

(() => {
    const ARTICLE = location.pathname.split('/').pop().replace('.html', '') || 'article';
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const SVG_NS = 'http://www.w3.org/2000/svg';

    const TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=cb1_49bf_1_6cd23bb70be548965ad61a75';
    const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

    const scenes = [...document.querySelectorAll('.scene')];
    const sceneName = (s) => s.querySelector('.scene-name').textContent.trim();
    const OU = window.CJ && CJ.lang === 'en' ? ' or ' : ' ou ';

    function track(name, params = {}) {
        if (typeof window.gtag === 'function') window.gtag('event', name, { article: ARTICLE, ...params });
    }

    // =====================
    // Le câble : un seul tracé, de l'ouverture à la dernière prise
    // =====================
    // Il descend en boucle dans l'ouverture, passe derrière le sommaire,
    // rejoint la marge gauche puis relie les prises des scènes. Il se déroule
    // au fil du défilement, avec un léger amorti pour rester fluide.
    function initCable() {
        const main = document.querySelector('main');
        const section = document.getElementById('scenes');
        const hero = document.querySelector('.mag-hero');
        const panel = document.querySelector('.patch-panel');
        const intro = document.querySelector('.mag-intro');
        if (!main || !section || !hero || !panel || !intro || scenes.length < 2) return;

        const prises = scenes.map(s => s.querySelector('.prise'));
        const svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('class', 'page-cable');
        svg.setAttribute('aria-hidden', 'true');

        const ghost = document.createElementNS(SVG_NS, 'path');
        ghost.setAttribute('class', 'cable-ghost');
        const group = document.createElementNS(SVG_NS, 'g');
        group.setAttribute('class', 'cable');
        const layers = ['cable-shade', 'cable-core', 'cable-shine'].map(cls => {
            const p = document.createElementNS(SVG_NS, 'path');
            p.setAttribute('class', cls);
            group.appendChild(p);
            return p;
        });
        svg.append(ghost, group);
        main.prepend(svg);
        section.classList.add('has-cable');

        const STEP = 8;       // un échantillon tous les 8 px de câble
        let length = 0;
        let reach = [];       // hauteur atteinte par le câble, échantillon par échantillon
        let priseLength = [];
        let target = 0;
        let shown = reduceMotion ? Infinity : 0;
        let frame = null;
        const seen = new Set();

        const pt = (x, y) => `${x.toFixed(1)} ${y.toFixed(1)}`;

        function build() {
            const box = main.getBoundingClientRect();
            const rel = (el) => {
                const r = el.getBoundingClientRect();
                return { top: r.top - box.top, bottom: r.bottom - box.top, left: r.left - box.left, right: r.right - box.left, width: r.width, height: r.height };
            };
            const W = main.clientWidth;
            const mobile = W <= 768;
            const h = rel(hero);
            const p = rel(panel);
            const intr = rel(intro);
            const points = prises.map(el => {
                const r = rel(el);
                return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
            });

            // 1. L'ouverture : une grande boucle à droite du titre (un simple fil le long du bord sur mobile)
            let d;
            let last;
            if (mobile) {
                last = { x: W - 10, y: h.top + h.height * 0.7 };
                d = `M${pt(last.x, h.top - 20)} L${pt(last.x, last.y)}`;
            } else {
                const zone = Math.min(W * 0.5, 620);
                const sc = Math.min(zone / 600, h.height / 900);
                const ox = W - 600 * sc;
                const oy = h.top + (h.height - 900 * sc) / 2;
                const k = (x, y) => pt(ox + x * sc, oy + y * sc);
                last = { x: ox + 470 * sc, y: oy + 680 * sc };
                d = `M${pt(ox + 470 * sc, h.top - 20)} L${k(470, -20)}` +
                    ` C${k(470, 140)} ${k(590, 190)} ${k(540, 320)}` +
                    ` C${k(490, 450)} ${k(230, 390)} ${k(240, 520)}` +
                    ` C${k(250, 650)} ${k(470, 560)} ${k(470, 680)}`;
            }

            // 2. Derrière le sommaire, le long de son bord droit
            const xr = mobile ? W - 10 : Math.min(p.right + 36, W - 24);
            const a = { x: xr, y: p.top + 40 };
            const dy = a.y - last.y;
            d += ` C${pt(last.x, last.y + dy * 0.5)} ${pt(xr, a.y - dy * 0.5)} ${pt(a.x, a.y)}`;
            const b = { x: xr, y: p.bottom - 30 };
            d += ` L${pt(b.x, b.y)}`;

            // 3. Sous le sommaire, il traverse vers la marge gauche, au-dessus de l'introduction
            const gx = points[0].x;
            const c = { x: gx, y: intr.top + parseFloat(getComputedStyle(intro).paddingTop) - 16 };
            const sag = (c.y - b.y) * 0.6;
            d += ` C${pt(xr, b.y + sag)} ${pt(gx, c.y - sag)} ${pt(c.x, c.y)}`;
            d += ` L${pt(points[0].x, points[0].y)}`;

            // 4. Entre les prises : une boucle souple, alternativement à gauche et à droite
            const gutter = parseFloat(getComputedStyle(section).getPropertyValue('--gutter')) || 132;
            const swing = gutter * 0.42;
            for (let i = 1; i < points.length; i++) {
                const from = points[i - 1];
                const to = points[i];
                const span = to.y - from.y;
                const cx = from.x + (i % 2 ? 1 : -1) * swing;
                d += ` C${pt(cx, from.y + span * 0.28)} ${pt(cx, to.y - span * 0.28)} ${pt(to.x, to.y)}`;
            }

            const height = points[points.length - 1].y + 40;
            svg.setAttribute('height', height);
            svg.style.height = `${height}px`;
            ghost.setAttribute('d', d);
            layers.forEach(path => path.setAttribute('d', d));

            length = layers[1].getTotalLength();
            reach = [];
            let max = -Infinity;
            for (let l = 0; l <= length; l += STEP) {
                max = Math.max(max, layers[1].getPointAtLength(l).y);
                reach.push(max);
            }
            priseLength = points.map(q => lengthAt(q.y));
            layers.forEach(path => { path.style.strokeDasharray = `${length} ${length}`; });
            if (shown === Infinity) shown = length;
            update();
        }

        // Longueur de câble nécessaire pour atteindre la hauteur y
        function lengthAt(y) {
            if (!reach.length || y <= reach[0]) return 0;
            let lo = 0;
            let hi = reach.length - 1;
            if (y >= reach[hi]) return length;
            while (hi - lo > 1) {
                const mid = (lo + hi) >> 1;
                if (reach[mid] < y) lo = mid; else hi = mid;
            }
            return hi * STEP;
        }

        function paint() {
            const drawn = Math.min(shown, length);
            layers.forEach(path => { path.style.strokeDashoffset = `${length - drawn}`; });
            prises.forEach((el, i) => {
                const on = drawn >= priseLength[i] - 1;
                el.classList.toggle('is-on', on);
                if (on && !seen.has(i)) {
                    seen.add(i);
                    track('mag_stop', { stop: scenes[i].id });
                }
            });
        }

        // Le câble rattrape la position de lecture avec un léger amorti
        function animate() {
            const gap = target - shown;
            shown = Math.abs(gap) < 0.5 ? target : shown + gap * 0.12;
            paint();
            frame = shown === target ? null : requestAnimationFrame(animate);
        }

        function update() {
            const line = window.innerHeight * 0.7 - main.getBoundingClientRect().top;
            target = reduceMotion ? length : lengthAt(line);
            if (reduceMotion) {
                shown = target;
                paint();
            } else if (!frame) {
                frame = requestAnimationFrame(animate);
            }
        }

        window.addEventListener('scroll', update, { passive: true });

        // Images chargées tardivement, polices ou changement de largeur : on retrace
        let timer = null;
        const rebuild = () => {
            clearTimeout(timer);
            timer = setTimeout(build, 120);
        };
        if ('ResizeObserver' in window) new ResizeObserver(rebuild).observe(main);
        else window.addEventListener('resize', rebuild);
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(rebuild);
        build();
    }

    // =====================
    // « Ce soir, j'ai envie… » : allume les prises du sommaire
    // =====================
    function initEnvies() {
        const chips = [...document.querySelectorAll('.envie')];
        const result = document.getElementById('enviesResult');
        const list = document.querySelector('.patch-list');
        const lines = list ? [...list.querySelectorAll('li')] : [];
        if (!chips.length) return;

        const lineFor = (id) => lines.find(li => li.querySelector(`a[href="#${id}"]`));

        function clear() {
            chips.forEach(c => c.setAttribute('aria-pressed', 'false'));
            lines.forEach(li => li.classList.remove('is-match'));
            if (list) list.classList.remove('has-match');
            if (result) result.textContent = '';
        }

        chips.forEach(chip => {
            chip.addEventListener('click', () => {
                const wasOn = chip.getAttribute('aria-pressed') === 'true';
                clear();
                if (wasOn) return;

                chip.setAttribute('aria-pressed', 'true');
                const ids = chip.dataset.targets.split(/\s+/).filter(Boolean);
                ids.forEach(id => lineFor(id)?.classList.add('is-match'));
                if (list) list.classList.add('has-match');

                if (result) {
                    result.append('→ ');
                    ids.forEach((id, k) => {
                        const scene = document.getElementById(id);
                        if (!scene) return;
                        if (k > 0) result.append(k === ids.length - 1 ? OU : ', ');
                        const a = document.createElement('a');
                        a.href = `#${id}`;
                        a.textContent = sceneName(scene);
                        result.append(a);
                    });
                    result.append('.');
                }
                track('mag_envie', { envie: chip.textContent.trim() });
            });
        });
    }

    // =====================
    // La carte des scènes
    // =====================
    function initSonMap() {
        const el = document.getElementById('sonMap');
        if (!el || typeof L === 'undefined') return;

        const map = L.map(el, {
            scrollWheelZoom: false,
            zoomSnap: 0.25,
            attributionControl: true
        });
        L.tileLayer(TILE_URL, { subdomains: 'abcd', maxZoom: 20, attribution: TILE_ATTRIBUTION }).addTo(map);

        const SIZE = 28;
        const points = [];
        scenes.forEach((s, i) => {
            const lat = parseFloat(s.dataset.lat);
            const lng = parseFloat(s.dataset.lng);
            if (Number.isNaN(lat) || Number.isNaN(lng)) return;
            const marker = L.marker([lat, lng], {
                icon: L.divIcon({
                    className: 'son-marker-wrap',
                    html: `<span class="son-marker">${i + 1}</span>`,
                    iconSize: [SIZE, SIZE],
                    iconAnchor: [SIZE / 2, SIZE / 2]
                }),
                keyboard: false
            }).addTo(map);
            marker.bindTooltip(sceneName(s), { direction: 'top', offset: [0, -SIZE / 2], className: 'son-tooltip' });
            marker.on('click', () => {
                s.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
                track('mag_map_click', { stop: s.id });
            });
            points.push([lat, lng]);
        });

        if (points.length) map.fitBounds(points, { padding: [40, 40], maxZoom: 17 });
        window.addEventListener('resize', () => map.invalidateSize());
    }

    initCable();
    initEnvies();
    initSonMap();
})();
