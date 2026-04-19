// =====================
// script.js — Page d'accueil
// Gère : nav burger mobile + contrôles audio de la vidéo hero
// =====================

document.addEventListener('DOMContentLoaded', () => {
    initNavBurger();
    initVideoControls();
});

// =====================
// Menu burger mobile
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

    // Fermer le menu quand on clique sur un lien
    menu.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', () => {
            menu.classList.remove('open');
            burger.classList.remove('open');
            burger.setAttribute('aria-expanded', 'false');
        });
    });
}

// =====================
// Contrôles audio vidéo hero
// =====================
function initVideoControls() {
    const video = document.querySelector('.hero-video');
    const volumeBtn = document.getElementById('volumeBtn');
    const volumeSlider = document.getElementById('volumeSlider');

    if (!video || !volumeBtn || !volumeSlider) return;

    volumeBtn.addEventListener('click', () => {
        if (video.muted) {
            video.muted = false;
            video.volume = volumeSlider.value / 100;
            volumeBtn.textContent = video.volume > 0.5 ? '🔊' : '🔉';
        } else {
            video.muted = true;
            volumeBtn.textContent = '🔇';
        }
    });

    volumeSlider.addEventListener('input', (e) => {
        const volume = e.target.value / 100;
        video.volume = volume;
        video.muted = false;

        if (volume === 0) {
            volumeBtn.textContent = '🔇';
        } else if (volume > 0.5) {
            volumeBtn.textContent = '🔊';
        } else {
            volumeBtn.textContent = '🔉';
        }
    });
}
