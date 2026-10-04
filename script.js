// =====================
// script.js — Page d'accueil
// Gère : nav burger mobile (le reste de l'accueil est dans home.js)
// =====================

document.addEventListener('DOMContentLoaded', () => {
    initNavBurger();
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
