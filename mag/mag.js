// =====================================================================
// mag.js — Moteur des articles du Mag
// ---------------------------------------------------------------------
// Gère : nav burger, progression de lecture, bulles de l'ouverture,
// carte de la tournée synchronisée au défilement (GSAP ScrollTrigger),
// néons des étapes, photos en mouvement, halo, partage, analytics.
//
// Prérequis dans la page : Leaflet, puis GSAP + ScrollTrigger (cdnjs),
// et un <script type="application/json" id="tourData"> :
//   { "stops": [{ "id", "lat", "lng" }, …],
//     "legs":  [{ "distance", "minutes", "path": [[lat, lng], …] }, …] }
// Sans GSAP (hors ligne…), un repli IntersectionObserver garde la carte
// fonctionnelle, sans animation liée au défilement.
// =====================================================================

(() => {
    const ARTICLE = location.pathname.split('/').pop().replace('.html', '') || 'article';
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const finePointer = window.matchMedia('(pointer: fine)').matches;

    const TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=cb1_49bf_1_6cd23bb70be548965ad61a75';
    const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';
    const STOP_ZOOM = 17;

    const hasGsap = typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined';
    if (hasGsap) gsap.registerPlugin(ScrollTrigger);

    function track(name, params = {}) {
        if (typeof window.gtag === 'function') window.gtag('event', name, { article: ARTICLE, ...params });
    }

    // =====================
    // Menu burger
    // =====================
    function initNavBurger() {
        const burger = document.getElementById('navBurger');
        const menu = document.getElementById('navMenu');
        if (!burger || !menu) return;

        burger.addEventListener('click', () => {
            const isOpen = menu.classList.toggle('open');
            burger.classList.toggle('open', isOpen);
            burger.setAttribute('aria-expanded', isOpen);
        });
        menu.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', () => {
                menu.classList.remove('open');
                burger.classList.remove('open');
                burger.setAttribute('aria-expanded', 'false');
            });
        });
    }

    // =====================
    // Progression de lecture
    // =====================
    function initReadingProgress() {
        const bar = document.getElementById('readingProgress');
        const main = document.querySelector('main');
        if (!bar || !main) return;

        let ticking = false;
        const update = () => {
            ticking = false;
            const rect = main.getBoundingClientRect();
            const total = rect.height - window.innerHeight;
            const ratio = total > 0 ? Math.min(1, Math.max(0, -rect.top / total)) : 0;
            bar.style.transform = `scaleX(${ratio})`;
        };
        window.addEventListener('scroll', () => {
            if (!ticking) {
                ticking = true;
                requestAnimationFrame(update);
            }
        }, { passive: true });
        update();
    }

    // =====================
    // Bulles qui montent dans l'ouverture
    // =====================
    function initBubbles() {
        const canvas = document.querySelector('.mag-bubbles');
        if (!canvas || reduceMotion) return;

        const ctx = canvas.getContext('2d');
        const colors = ['255,255,255', '255,79,163', '63,224,192', '255,179,64'];
        let width = 0;
        let height = 0;
        let bubbles = [];
        let running = false;
        let frame = null;

        function resize() {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            width = canvas.clientWidth;
            height = canvas.clientHeight;
            canvas.width = width * dpr;
            canvas.height = height * dpr;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            const count = Math.round(Math.min(70, width / 18));
            bubbles = Array.from({ length: count }, () => spawn(true));
        }

        function spawn(anywhere) {
            return {
                x: Math.random() * width,
                y: anywhere ? Math.random() * height : height + 10,
                r: 1 + Math.random() * 3.5,
                speed: 0.25 + Math.random() * 0.8,
                sway: Math.random() * Math.PI * 2,
                color: colors[Math.random() < 0.6 ? 0 : 1 + Math.floor(Math.random() * 3)],
                alpha: 0.15 + Math.random() * 0.35
            };
        }

        function draw() {
            ctx.clearRect(0, 0, width, height);
            for (const b of bubbles) {
                b.y -= b.speed;
                b.sway += 0.02;
                const x = b.x + Math.sin(b.sway) * 6;
                // Les bulles s'estompent en approchant du haut
                const fade = Math.min(1, b.y / (height * 0.5));
                ctx.beginPath();
                ctx.arc(x, b.y, b.r, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(${b.color},${b.alpha * fade})`;
                ctx.lineWidth = 1;
                ctx.stroke();
                if (b.y < -10) Object.assign(b, spawn(false));
            }
            frame = requestAnimationFrame(draw);
        }

        function setRunning(on) {
            if (on === running) return;
            running = on;
            if (on) frame = requestAnimationFrame(draw);
            else cancelAnimationFrame(frame);
        }

        resize();
        window.addEventListener('resize', resize);
        // Pause quand l'ouverture n'est plus visible
        new IntersectionObserver(([entry]) => setRunning(entry.isIntersecting)).observe(canvas);
    }

    // =====================
    // Halo lumineux qui suit la souris
    // =====================
    function initHalo() {
        const halo = document.querySelector('.mag-halo');
        if (!halo || !finePointer || reduceMotion) return;

        halo.classList.add('is-on');
        let x = window.innerWidth / 2;
        let y = window.innerHeight / 2;
        let pending = false;

        window.addEventListener('pointermove', (e) => {
            x = e.clientX;
            y = e.clientY;
            if (!pending) {
                pending = true;
                requestAnimationFrame(() => {
                    pending = false;
                    halo.style.transform = `translate(${x - 280}px, ${y - 280}px)`;
                });
            }
        }, { passive: true });
    }

    // =====================
    // La tournée : carte + étapes
    // =====================
    function initTour() {
        const section = document.getElementById('tournee');
        const dataEl = document.getElementById('tourData');
        if (!section || !dataEl) return;

        const data = JSON.parse(dataEl.textContent);
        const stops = [...section.querySelectorAll('.tour-stop')];
        const walks = [...section.querySelectorAll('.tour-walk')];
        const neons = stops.map(s => getComputedStyle(s).getPropertyValue('--neon').trim());
        const names = stops.map(s => s.querySelector('.neon').textContent.trim());
        const stepNum = document.getElementById('tourStepNum');
        const stepName = document.getElementById('tourStepName');

        let current = -1;
        let map = null;
        let markers = [];
        let doneLines = [];
        let walker = null;

        // Distances cumulées le long de chaque tracé, pour dessiner une fraction du chemin
        const legLengths = data.legs.map(leg => cumulativeLengths(leg.path));

        if (typeof L !== 'undefined') {
            map = L.map('tourMap', {
                zoomControl: false,
                dragging: false,
                touchZoom: false,
                scrollWheelZoom: false,
                doubleClickZoom: false,
                boxZoom: false,
                keyboard: false,
                tap: false,
                zoomSnap: 0.25
            });
            L.tileLayer(TILE_URL, { subdomains: 'abcd', maxZoom: 20, attribution: TILE_ATTRIBUTION }).addTo(map);

            data.legs.forEach(leg => {
                L.polyline(leg.path, { className: 'tour-route-ghost', interactive: false }).addTo(map);
            });
            // Chaque tronçon prend la couleur de l'étape où il mène
            doneLines = data.legs.map((leg, i) => L.polyline([], {
                className: 'tour-route-done',
                color: neons[i + 1] || neons[i],
                weight: 4,
                opacity: 1,
                interactive: false
            }).addTo(map));

            markers = data.stops.map((stop, i) => L.marker([stop.lat, stop.lng], {
                icon: L.divIcon({
                    className: 'tour-marker-wrap',
                    html: `<span class="tour-marker" style="--neon:${neons[i]}">${i + 1}</span>`,
                    iconSize: [32, 32],
                    iconAnchor: [16, 16]
                }),
                interactive: false,
                keyboard: false
            }).addTo(map));

            walker = L.marker([data.stops[0].lat, data.stops[0].lng], {
                icon: L.divIcon({ className: 'tour-walker', iconSize: [12, 12], iconAnchor: [6, 6] }),
                interactive: false,
                keyboard: false
            });

            showOverview(false);
            window.addEventListener('resize', () => map.invalidateSize());
        }

        function showOverview(animate = true) {
            if (!map) return;
            const bounds = L.latLngBounds(data.stops.map(s => [s.lat, s.lng]));
            data.legs.forEach(leg => bounds.extend(L.latLngBounds(leg.path)));
            const opts = { padding: [48, 48], maxZoom: 17 };
            if (animate && !reduceMotion) map.flyToBounds(bounds, { ...opts, duration: 1 });
            else map.fitBounds(bounds, opts);
        }

        function setStop(i) {
            if (i === current) return;
            current = i;

            stops.forEach((s, k) => s.classList.toggle('is-current', k === i));
            if (i < 0) {
                markers.forEach(m => markerEl(m)?.classList.remove('is-active', 'is-visited'));
                showOverview();
                return;
            }

            stops[i].querySelector('.neon').classList.add('is-lit');
            section.style.setProperty('--current-neon', neons[i]);
            document.body.style.setProperty('--halo', neons[i]);
            if (stepNum) stepNum.textContent = i + 1;
            if (stepName) stepName.textContent = names[i];

            markers.forEach((m, k) => {
                const el = markerEl(m);
                el?.classList.toggle('is-active', k === i);
                el?.classList.toggle('is-visited', k < i);
            });

            if (map) {
                const s = data.stops[i];
                if (reduceMotion) map.setView([s.lat, s.lng], STOP_ZOOM);
                else map.flyTo([s.lat, s.lng], STOP_ZOOM, { duration: 1.1 });
            }
            track('mag_stop', { stop: stops[i].id });
        }

        function focusLeg(i) {
            if (!map) return;
            const opts = { padding: [56, 56], maxZoom: 17.5 };
            const bounds = L.latLngBounds(data.legs[i].path);
            if (reduceMotion) map.fitBounds(bounds, opts);
            else map.flyToBounds(bounds, { ...opts, duration: 0.9 });
        }

        // Dessine le tronçon i jusqu'à `progress` (0 → 1), les autres pleins ou vides
        function drawLeg(i, progress) {
            if (!map) return;
            doneLines.forEach((line, k) => {
                if (k < i) line.setLatLngs(data.legs[k].path);
                else if (k > i) line.setLatLngs([]);
            });
            const pts = partialPath(data.legs[i].path, legLengths[i], progress);
            doneLines[i].setLatLngs(pts);

            if (progress > 0 && progress < 1 && pts.length) {
                walker.setLatLng(pts[pts.length - 1]);
                if (!map.hasLayer(walker)) walker.addTo(map);
            } else if (map.hasLayer(walker)) {
                walker.remove();
            }
        }

        if (hasGsap) {
            stops.forEach((stop, i) => {
                ScrollTrigger.create({
                    trigger: stop,
                    start: 'top 62%',
                    end: 'bottom 38%',
                    onEnter: () => setStop(i),
                    onEnterBack: () => setStop(i),
                    // Remonter au-dessus de la 1re étape : vue d'ensemble
                    onLeaveBack: () => { if (i === 0) setStop(-1); }
                });
            });

            walks.forEach((walk, i) => {
                ScrollTrigger.create({
                    trigger: walk,
                    start: 'top 78%',
                    end: 'bottom 30%',
                    onEnter: () => focusLeg(i),
                    onEnterBack: () => focusLeg(i),
                    onUpdate: (self) => drawLeg(i, self.progress),
                    onLeave: () => drawLeg(i, 1),
                    onLeaveBack: () => drawLeg(i, 0)
                });
            });

            if (!reduceMotion) animatePhotos();
            // Les images chargées tardivement changent la hauteur des étapes
            window.addEventListener('load', () => ScrollTrigger.refresh());
        } else if ('IntersectionObserver' in window) {
            // Repli : chaque étape et chaque trajet se déclenchent à l'apparition
            const io = new IntersectionObserver(entries => {
                entries.forEach(entry => {
                    if (!entry.isIntersecting) return;
                    const el = entry.target;
                    if (el.classList.contains('tour-stop')) setStop(stops.indexOf(el));
                    else {
                        const i = walks.indexOf(el);
                        focusLeg(i);
                        drawLeg(i, 1);
                    }
                });
            }, { rootMargin: '-40% 0px -40% 0px' });
            [...stops, ...walks].forEach(el => io.observe(el));
        } else {
            stops.forEach(s => s.querySelector('.neon').classList.add('is-lit'));
        }
    }

    function markerEl(marker) {
        const el = marker.getElement();
        return el ? el.querySelector('.tour-marker') : null;
    }

    // Photos : le verre glisse sur la photo d'équipe au fil du défilement
    function animatePhotos() {
        gsap.utils.toArray('.tour-photos').forEach(fig => {
            const back = fig.querySelector('.tour-photo--back');
            const front = fig.querySelector('.tour-photo--front');
            const scrollTrigger = { trigger: fig, start: 'top bottom', end: 'bottom top', scrub: true };
            if (back) gsap.fromTo(back, { yPercent: 6 }, { yPercent: -6, ease: 'none', scrollTrigger });
            if (front) gsap.fromTo(front, { yPercent: 30, rotate: 9 }, { yPercent: -12, rotate: 3, ease: 'none', scrollTrigger: { ...scrollTrigger } });
        });
    }

    // Distance (approchée, en mètres) entre deux points [lat, lng]
    function distance(a, b) {
        const k = Math.PI / 180;
        const x = (b[1] - a[1]) * k * Math.cos(((a[0] + b[0]) / 2) * k);
        const y = (b[0] - a[0]) * k;
        return Math.sqrt(x * x + y * y) * 6371000;
    }

    function cumulativeLengths(path) {
        const acc = [0];
        for (let i = 1; i < path.length; i++) acc.push(acc[i - 1] + distance(path[i - 1], path[i]));
        return acc;
    }

    function partialPath(path, lengths, progress) {
        if (progress <= 0) return [];
        if (progress >= 1) return path;
        const target = lengths[lengths.length - 1] * progress;
        const out = [path[0]];
        for (let i = 1; i < path.length; i++) {
            if (lengths[i] >= target) {
                const t = (target - lengths[i - 1]) / (lengths[i] - lengths[i - 1] || 1);
                out.push([
                    path[i - 1][0] + (path[i][0] - path[i - 1][0]) * t,
                    path[i - 1][1] + (path[i][1] - path[i - 1][1]) * t
                ]);
                break;
            }
            out.push(path[i]);
        }
        return out;
    }

    // =====================
    // Partage + suivi des boutons
    // =====================
    function initShare() {
        const btn = document.getElementById('magShare');
        const status = document.getElementById('magShareStatus');
        if (!btn) return;

        btn.addEventListener('click', async () => {
            const shareData = { title: document.title, url: location.href.split('#')[0] };
            try {
                if (navigator.share) {
                    await navigator.share(shareData);
                    track('mag_share', { method: 'native' });
                } else {
                    await navigator.clipboard.writeText(shareData.url);
                    if (status) status.textContent = 'Lien copié dans le presse-papiers.';
                    track('mag_share', { method: 'clipboard' });
                }
            } catch (_) {
                // Partage annulé par l'utilisateur : rien à faire
            }
        });

        document.querySelectorAll('[data-track]').forEach(el => {
            el.addEventListener('click', () => track('mag_cta', { cta: el.dataset.track }));
        });
    }

    initNavBurger();
    initReadingProgress();
    initBubbles();
    initHalo();
    initTour();
    initShare();
})();
