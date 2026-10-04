// =====================
// pwa.js — Partagé par toutes les pages publiques
// Gère : enregistrement du service worker + CTA « Installer l'app »
//
// Les CTA sont des éléments [data-pwa-install] masqués par défaut (attribut hidden),
// avec un bouton [data-pwa-install-btn]. Ils ne s'affichent que si l'installation
// est possible, et disparaissent une fois l'app installée.
// =====================

(() => {
    const IOS_DONE_KEY = 'pwa-ios-installed';

    // =====================
    // Service worker
    // =====================
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js').catch(err => {
                console.warn('[PWA] Service worker non enregistré :', err);
            });
        });
    }

    // =====================
    // Détection de l'environnement
    // =====================
    const standaloneQuery = window.matchMedia('(display-mode: standalone)');
    const isStandalone = () => standaloneQuery.matches || navigator.standalone === true;

    // iPadOS se présente comme un Mac : on le repère au tactile
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
        || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    function storageGet(key) {
        try { return localStorage.getItem(key); } catch (_) { return null; }
    }

    function storageSet(key, value) {
        try { localStorage.setItem(key, value); } catch (_) {}
    }

    function track(name, params = {}) {
        if (typeof window.gtag === 'function') window.gtag('event', name, params);
    }

    // =====================
    // Affichage des CTA
    // =====================
    let deferredPrompt = null;

    function setCtaVisible(visible) {
        document.querySelectorAll('[data-pwa-install]').forEach(el => {
            el.hidden = !visible;
        });
    }

    function refresh() {
        if (isStandalone()) return setCtaVisible(false);
        if (deferredPrompt) return setCtaVisible(true);
        if (isIOS) return setCtaVisible(storageGet(IOS_DONE_KEY) !== '1');
        setCtaVisible(false);
    }

    // Chrome, Edge, Samsung Internet : l'événement n'est émis que si l'app
    // est installable et pas encore installée
    window.addEventListener('beforeinstallprompt', event => {
        event.preventDefault();
        deferredPrompt = event;
        refresh();
    });

    window.addEventListener('appinstalled', () => {
        deferredPrompt = null;
        setCtaVisible(false);
        track('pwa_installed', { platform: 'prompt' });
    });

    standaloneQuery.addEventListener?.('change', refresh);

    async function onInstallClick() {
        track('pwa_cta_click', { platform: deferredPrompt ? 'prompt' : (isIOS ? 'ios' : 'other') });

        if (deferredPrompt) {
            const prompt = deferredPrompt;
            deferredPrompt = null;
            prompt.prompt();
            const { outcome } = await prompt.userChoice;
            track('pwa_prompt_result', { outcome });
            refresh();
            return;
        }

        if (isIOS) openIosDialog();
    }

    // =====================
    // Aide à l'installation sur iPhone / iPad
    // =====================
    const SHARE_ICON = `<svg class="pwa-share-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3v12M8 7l4-4 4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M7 10H5v11h14V10h-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;

    let iosDialog = null;

    function openIosDialog() {
        if (!iosDialog) {
            iosDialog = document.createElement('dialog');
            iosDialog.className = 'pwa-dialog';
            iosDialog.setAttribute('aria-labelledby', 'pwaDialogTitle');
            iosDialog.innerHTML = `<div class="pwa-dialog-body">
                <img src="icons/icon-192.png" alt="" class="pwa-dialog-icon" width="56" height="56">
                <h2 class="pwa-dialog-title" id="pwaDialogTitle">Installer Cours Ju</h2>
                <ol class="pwa-dialog-steps">
                    <li>Touche le bouton <strong>Partager</strong> ${SHARE_ICON}
                        <small>en bas de Safari, parfois derrière le menu « ⋯ »</small></li>
                    <li>Choisis <strong>Sur l'écran d'accueil</strong></li>
                    <li>Confirme avec <strong>Ajouter</strong></li>
                </ol>
                <div class="pwa-dialog-actions">
                    <button type="button" class="install-btn" data-pwa-done>C'est fait</button>
                    <button type="button" class="pwa-dialog-close" data-pwa-close>Plus tard</button>
                </div>
            </div>`;
            document.body.appendChild(iosDialog);

            iosDialog.querySelector('[data-pwa-close]').addEventListener('click', () => iosDialog.close());
            iosDialog.querySelector('[data-pwa-done]').addEventListener('click', () => {
                storageSet(IOS_DONE_KEY, '1');
                track('pwa_installed', { platform: 'ios' });
                iosDialog.close();
                refresh();
            });
            // Clic sur le fond (hors .pwa-dialog-body) : fermer
            iosDialog.addEventListener('click', event => {
                if (event.target === iosDialog) iosDialog.close();
            });
        }
        iosDialog.showModal();
    }

    // =====================
    // Initialisation
    // =====================
    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('[data-pwa-install-btn]').forEach(btn => {
            btn.addEventListener('click', onInstallClick);
        });
        refresh();
    });
})();
