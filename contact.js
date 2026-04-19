// =====================
// contact.js — Gère la nav burger + soumission AJAX du formulaire
// =====================

document.addEventListener('DOMContentLoaded', () => {
    initNavBurger();
    initContactForm();
});

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

function initContactForm() {
    const form = document.getElementById('contactForm');
    const status = document.getElementById('contactStatus');
    const submitBtn = form.querySelector('.contact-submit');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        status.hidden = true;
        status.className = 'contact-status';
        submitBtn.disabled = true;
        submitBtn.textContent = 'Envoi…';

        try {
            const data = new FormData(form);
            const res = await fetch(form.action, {
                method: 'POST',
                body: data,
                headers: { 'Accept': 'application/json' }
            });

            if (res.ok) {
                form.reset();
                status.hidden = false;
                status.classList.add('success');
                status.textContent = '✅ Message envoyé, merci ! On te répondra bientôt.';
            } else {
                const body = await res.json().catch(() => ({}));
                const msg = body.errors?.map(x => x.message).join(', ') || 'Une erreur est survenue.';
                status.hidden = false;
                status.classList.add('error');
                status.textContent = '❌ ' + msg;
            }
        } catch (err) {
            status.hidden = false;
            status.classList.add('error');
            status.textContent = '❌ Problème réseau, réessaie plus tard.';
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Envoyer';
        }
    });
}
