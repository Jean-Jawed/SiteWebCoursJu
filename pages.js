// Pages de lecture longue : menu, sommaire actif, progression de lecture, apparitions au scroll.
// Même comportement que la page « Le quartier ».
(function () {
    const burger = document.getElementById('navBurger');
    const menu = document.getElementById('navMenu');
    if (burger && menu) {
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

    const tocLinks = [...document.querySelectorAll('.quartier-toc a')];
    const chapters = tocLinks.map(a => document.querySelector(a.getAttribute('href')));
    const article = document.querySelector('.quartier-article');
    const progress = document.getElementById('readingProgress');
    let ticking = false;

    function updateReading() {
        ticking = false;
        if (!article) return;
        const rect = article.getBoundingClientRect();
        const total = rect.height - window.innerHeight * 0.6;
        const ratio = Math.min(1, Math.max(0, -rect.top / total));
        if (progress) progress.style.transform = `scaleX(${ratio})`;

        let current = -1;
        chapters.forEach((el, i) => {
            if (el && el.getBoundingClientRect().top < window.innerHeight * 0.35) current = i;
        });
        tocLinks.forEach((a, i) => {
            if (i === current) a.setAttribute('aria-current', 'true');
            else a.removeAttribute('aria-current');
        });
    }

    window.addEventListener('scroll', () => {
        if (!ticking) {
            ticking = true;
            requestAnimationFrame(updateReading);
        }
    }, { passive: true });
    window.addEventListener('resize', updateReading);
    updateReading();

    const reveals = document.querySelectorAll('.reveal');
    if ('IntersectionObserver' in window) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.08 });
        reveals.forEach(el => observer.observe(el));
    } else {
        reveals.forEach(el => el.classList.add('visible'));
    }
})();
