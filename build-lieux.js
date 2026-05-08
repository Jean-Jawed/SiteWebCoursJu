import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper Firebase Storage
const STORAGE_BUCKET = "cours-julien.firebasestorage.app";
function publicUrlFromPath(path) {
    if (!path) return null;
    const encoded = encodeURIComponent(path);
    return `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/${encoded}?alt=media`;
}

function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function escapeAttr(str) {
    if (str == null) return '';
    return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// Parseur minimal pour l'API REST Firestore
function parseFirestoreValue(value) {
    if (!value) return null;
    if (value.stringValue !== undefined) return value.stringValue;
    if (value.integerValue !== undefined) return parseInt(value.integerValue, 10);
    if (value.doubleValue !== undefined) return parseFloat(value.doubleValue);
    if (value.booleanValue !== undefined) return value.booleanValue;
    if (value.arrayValue !== undefined) {
        return (value.arrayValue.values || []).map(parseFirestoreValue);
    }
    if (value.mapValue !== undefined) {
        const obj = {};
        for (const [k, v] of Object.entries(value.mapValue.fields || {})) {
            obj[k] = parseFirestoreValue(v);
        }
        return obj;
    }
    if (value.nullValue !== undefined) return null;
    return value;
}

function parseFirestoreDocument(doc) {
    const id = doc.name.split('/').pop();
    const data = {};
    for (const [key, value] of Object.entries(doc.fields || {})) {
        data[key] = parseFirestoreValue(value);
    }
    return { id, ...data };
}

async function fetchCollection(collectionName) {
    const documents = [];
    let pageToken = '';
    do {
        const url = `https://firestore.googleapis.com/v1/projects/cours-julien/databases/(default)/documents/${collectionName}?pageSize=1000${pageToken ? `&pageToken=${pageToken}` : ''}`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch ${collectionName}: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        if (data.documents) {
            documents.push(...data.documents.map(parseFirestoreDocument));
        }
        pageToken = data.nextPageToken;
    } while (pageToken);
    return documents;
}

async function buildLieux() {
    console.log('Fetching data from Firestore...');
    const lieuxRaw = await fetchCollection('lieux');
    const categoriesRaw = await fetchCollection('categories');

    const categories = {};
    for (const cat of categoriesRaw) {
        categories[cat.id] = cat;
    }

    const lieux = lieuxRaw.sort((a, b) => (a.nom || '').localeCompare(b.nom || ''));

    console.log(`Fetched ${lieux.length} lieux and ${categoriesRaw.length} categories.`);

    // 1. Build HTML Cards
    const countText = `${lieux.length} lieu${lieux.length > 1 ? 'x' : ''}`;
    
    function cardHTML(lieu) {
        const badges = (lieu.categories || []).map(cle => {
            const cat = categories[cle];
            if (!cat) return '';
            return `<span class="card-badge" style="background:${cat.couleur}">${cat.icon} ${escapeHtml(cat.nom)}</span>`;
        }).join('');

        const instagram = lieu.instagram
            ? `<a href="https://instagram.com/${lieu.instagram.replace('@', '')}" target="_blank" rel="noopener noreferrer" class="card-instagram">\n             📸 ${escapeHtml(lieu.instagram)}\n           </a>`
            : '';

        const imageUrl = publicUrlFromPath(lieu.image);
        const image = imageUrl
            ? `<img src="${escapeAttr(imageUrl)}"\n                alt="${escapeAttr(lieu.nom)}"\n                class="card-image"\n                data-src="${escapeAttr(imageUrl)}"\n                data-caption="${escapeAttr(lieu.nom)}"\n                loading="lazy">`
            : '<div class="card-image card-image-placeholder">📍</div>';

        return `
        <article class="lieu-card">
            ${image}
            <div class="card-body">
                <h3 class="card-title">${escapeHtml(lieu.nom)}</h3>
                <div class="card-badges">${badges}</div>
                <p class="card-description">${escapeHtml(lieu.description || '')}</p>
                <div class="card-actions">
                    ${instagram}
                    <button class="card-map-link" data-id="${lieu.id}" aria-label="Voir sur la carte">
                        🗺️ Voir sur la carte
                    </button>
                </div>
            </div>
        </article>
    `;
    }

    const cardsHtml = lieux.map(l => cardHTML(l)).join('');

    // 2. Build JSON-LD
    const jsonLd = {
        "@context": "https://schema.org",
        "@type": "ItemList",
        "itemListElement": lieux.map((lieu, index) => {
            const imageUrl = publicUrlFromPath(lieu.image);
            const item = {
                "@type": "LocalBusiness",
                "name": lieu.nom,
                "url": lieu.instagram ? `https://instagram.com/${lieu.instagram.replace('@', '')}` : undefined,
            };
            if (lieu.description) item.description = lieu.description;
            if (imageUrl) item.image = imageUrl;
            if (lieu.latitude && lieu.longitude) {
                item.geo = {
                    "@type": "GeoCoordinates",
                    "latitude": lieu.latitude,
                    "longitude": lieu.longitude
                };
            }
            return {
                "@type": "ListItem",
                "position": index + 1,
                "item": item
            };
        })
    };

    const jsonLdScript = `\n    <!-- JSON-LD SEO injecté au build -->\n    <script type="application/ld+json">\n${JSON.stringify(jsonLd, null, 2)}\n    </script>\n`;

    // 3. Inject into lieux.html
    const htmlPath = path.join(__dirname, 'lieux.html');
    let htmlContent = fs.readFileSync(htmlPath, 'utf8');

    // Inject JSON-LD before </head>
    htmlContent = htmlContent.replace(/<!-- JSON-LD SEO injecté au build -->[\s\S]*?<\/script>/, '');
    htmlContent = htmlContent.replace('</head>', `${jsonLdScript}</head>`);

    // Inject Count
    htmlContent = htmlContent.replace(
        /<p id="listCount" class="list-count">.*?<\/p>/,
        `<p id="listCount" class="list-count">${countText}</p>`
    );

    // Inject Cards
    htmlContent = htmlContent.replace(
        /(<div id="cardsGrid" class="cards-grid">)[\s\S]*?(<\/div>\s*<div id="listEmpty")/g,
        `$1\n${cardsHtml}\n                $2`
    );

    fs.writeFileSync(htmlPath, htmlContent, 'utf8');
    console.log('Successfully updated lieux.html with pre-rendered content and JSON-LD.');
}

buildLieux().catch(err => {
    console.error('Build failed:', err);
    process.exit(1);
});
