/*!
 * Orbit — Header universel (<orbit-header>)
 * Web Component autonome, sans dépendance, sans asset externe.
 * Une seule ligne à ajouter sur n'importe quel site du réseau Orbit.
 *
 *   <script src="https://orbit-umber-sigma.vercel.app/orbit-header.js" defer></script>
 *   <orbit-header app-name="Atlas" theme="travel"></orbit-header>
 *
 * Attributs (tous optionnels, tous réactifs à chaud) :
 *   app-name   — nom affiché à côté de la mascotte            (défaut: "Orbit")
 *   theme      — space | music | finance | media | travel | video | study | gaming | default
 *   accent     — couleur d'accent CSS, écrase le thème ET la détection
 *   accent-var — nom d'une variable CSS du site à utiliser comme accent,
 *                ex. accent-var="--gold" (sinon --accent/--primary/… sont testés)
 *   hub-url    — lien du hub                                  (défaut: HUB_URL)
 *   github     — URL du dépôt ; le lien est masqué si absent
 *   links      — "Libellé:url, Libellé:url" (liens additionnels, avant Hub)
 *   badge      — texte du badge réseau ; "" ou "none" pour le retirer
 *   appearance — auto | light | dark                          (défaut: auto)
 *   solid      — présent = fond opaque, pas de flou
 *   static     — présent = header non sticky
 *   compact    — présent = version dense (mascotte 30px, padding réduit)
 */
(function () {
  'use strict';

  var HUB_URL = 'https://orbit-umber-sigma.vercel.app'; // le hub Orbit

  // --- Thèmes : accent + accessoire de la mascotte -------------------------
  var THEMES = {
    default: { accent: '#6366F1', label: 'Réseau Orbit' },
    space:   { accent: '#22D3EE', label: 'Réseau Orbit' },
    music:   { accent: '#34D399', label: 'Réseau Orbit' },
    finance: { accent: '#F59E0B', label: 'Réseau Orbit' },
    media:   { accent: '#A78BFA', label: 'Réseau Orbit' },
    travel:  { accent: '#FB923C', label: 'Réseau Orbit' },
    video:   { accent: '#FF3D2E', label: 'Réseau Orbit' },
    study:   { accent: '#6366F1', label: 'Réseau Orbit' },
    gaming:  { accent: '#F43F5E', label: 'Réseau Orbit' }
  };

  // --- Mascotte : un corps commun + un accessoire par thème ----------------
  function penguinBody() {
    return [
      '<ellipse cx="32" cy="37" rx="20" ry="23" fill="var(--p-dark)"/>',
      '<ellipse cx="20" cy="40" rx="6"  ry="13" fill="var(--p-dark)" transform="rotate(12 20 40)"/>',
      '<ellipse cx="44" cy="40" rx="6"  ry="13" fill="var(--p-dark)" transform="rotate(-12 44 40)"/>',
      '<ellipse cx="32" cy="41" rx="13" ry="18" fill="var(--p-light)"/>',
      '<ellipse cx="25" cy="59" rx="6"  ry="3"  fill="var(--p-beak)"/>',
      '<ellipse cx="39" cy="59" rx="6"  ry="3"  fill="var(--p-beak)"/>',
      '<circle cx="26" cy="29" r="3.4" fill="#fff"/><circle cx="38" cy="29" r="3.4" fill="#fff"/>',
      '<circle cx="26.7" cy="29.5" r="1.7" fill="#111"/><circle cx="38.7" cy="29.5" r="1.7" fill="#111"/>',
      '<path d="M32 33 L26.5 37.5 L37.5 37.5 Z" fill="var(--p-beak)"/>'
    ].join('');
  }

  var ACCESSORIES = {
    // 🧑‍🚀 casque + orbites
    space:
      '<ellipse cx="32" cy="32" rx="22" ry="21" fill="var(--p-accent)" opacity=".16"/>' +
      '<ellipse cx="32" cy="32" rx="22" ry="21" fill="none" stroke="var(--p-accent)" stroke-width="2"/>' +
      '<path d="M14 22 A22 21 0 0 1 30 12" fill="none" stroke="#fff" stroke-width="2.5" opacity=".7" stroke-linecap="round"/>' +
      '<ellipse cx="32" cy="34" rx="30" ry="9" fill="none" stroke="var(--p-accent)" stroke-width="1.6" opacity=".75" transform="rotate(-22 32 34)"/>' +
      '<circle cx="57" cy="24" r="2.4" fill="var(--p-accent)"/>',
    // 🎧 casque audio + note
    music:
      '<path d="M16 28 A16 16 0 0 1 48 28" fill="none" stroke="var(--p-accent)" stroke-width="3.4" stroke-linecap="round"/>' +
      '<rect x="10" y="26" width="8" height="13" rx="4" fill="var(--p-accent)"/>' +
      '<rect x="46" y="26" width="8" height="13" rx="4" fill="var(--p-accent)"/>' +
      '<path d="M52 10 L52 19" stroke="var(--p-accent)" stroke-width="2" stroke-linecap="round"/>' +
      '<circle cx="50" cy="20" r="2.6" fill="var(--p-accent)"/>' +
      '<path d="M52 10 L58 8" stroke="var(--p-accent)" stroke-width="2" stroke-linecap="round"/>',
    // 💼 costume, cravate, lunettes
    finance:
      '<path d="M25 44 L32 38 L39 44 L36 58 L28 58 Z" fill="var(--p-accent)"/>' +
      '<path d="M32 36 L28 40 L32 43 L36 40 Z" fill="var(--p-accent)"/>' +
      '<rect x="20" y="25.5" width="10" height="7.5" rx="2" fill="none" stroke="#111" stroke-width="1.6" opacity=".85"/>' +
      '<rect x="34" y="25.5" width="10" height="7.5" rx="2" fill="none" stroke="#111" stroke-width="1.6" opacity=".85"/>' +
      '<path d="M30 29 h4" stroke="#111" stroke-width="1.6" opacity=".85"/>',
    // 🍿 pop-corn + lunettes 3D
    media:
      '<path d="M14 24 h9 v7 h-9 z" fill="none"/>' +
      '<rect x="19.5" y="25" width="11" height="7.5" rx="1.5" fill="#EF4444" opacity=".85"/>' +
      '<rect x="33.5" y="25" width="11" height="7.5" rx="1.5" fill="#3B82F6" opacity=".85"/>' +
      '<path d="M30.5 28.5 h3" stroke="#111" stroke-width="1.6"/>' +
      '<path d="M44 44 L52 44 L50 60 L46 60 Z" fill="#fff"/>' +
      '<path d="M44 44 L52 44 L51 50 L45 50 Z" fill="var(--p-accent)"/>' +
      '<circle cx="45.5" cy="42" r="2.6" fill="#FDE68A"/><circle cx="50" cy="41" r="2.2" fill="#FEF3C7"/>' +
      '<circle cx="48" cy="44" r="2.4" fill="#FDE68A"/>',
    // 🧳 chapeau d'aventurier + sangle de sac
    travel:
      '<path d="M12 22 q20 6 40 0 q-6 5 -20 5 q-14 0 -20 -5 z" fill="var(--p-accent)"/>' +
      '<path d="M21 22 q11 -14 22 0 z" fill="var(--p-accent)"/>' +
      '<path d="M20.5 21 q11.5 3 23 0" stroke="#7C2D12" stroke-width="2.2" fill="none" opacity=".65"/>' +
      '<path d="M24 40 L40 52" stroke="var(--p-accent)" stroke-width="3.2" stroke-linecap="round" opacity=".9"/>' +
      '<circle cx="33" cy="46.5" r="2.6" fill="#7C2D12"/>',
    // ▶️ bouton lecture tenu sous l'aileron + confettis de fin d'année
    video:
      '<rect x="39" y="38" width="19" height="14" rx="4.5" fill="var(--p-accent)"/>' +
      '<path d="M45.5 41.8 L52.5 45 L45.5 48.2 Z" fill="#fff"/>' +
      '<path d="M44 40 q-4 4 0 9" stroke="var(--p-dark)" stroke-width="2.4" fill="none" ' +
        'stroke-linecap="round" opacity=".55"/>' +
      '<circle cx="11" cy="17" r="1.9" fill="var(--p-accent)"/>' +
      '<circle cx="18" cy="10" r="1.4" fill="var(--p-accent)" opacity=".75"/>' +
      '<circle cx="52" cy="13" r="1.6" fill="var(--p-accent)" opacity=".85"/>' +
      '<path d="M8 27 l3 -2" stroke="var(--p-accent)" stroke-width="1.8" ' +
        'stroke-linecap="round" opacity=".6"/>' +
      '<path d="M57 22 l-3 -2" stroke="var(--p-accent)" stroke-width="1.8" ' +
        'stroke-linecap="round" opacity=".6"/>',
    // 🎓 toque de diplômé + fiole d'Erlenmeyer qui bulle
    // Ni couvre-chef plat ni objet en verre ailleurs, et les lunettes sont déjà
    // prises deux fois (finance, media) : la silhouette reste reconnaissable
    // même à 30px en mode compact.
    study:
      // la fiole, sous l'aileron droit
      '<rect x="51" y="35.5" width="4" height="5.5" rx="1" fill="var(--p-accent)" opacity=".85"/>' +
      '<path d="M51 41 L47.5 53 q-1 2.6 1.7 2.6 h10.6 q2.7 0 1.7 -2.6 L55 41 Z" ' +
        'fill="#fff" opacity=".92" stroke="var(--p-accent)" stroke-width="1.5" stroke-linejoin="round"/>' +
      '<path d="M48.6 49.5 h9.8 l1 3.5 q1 2.6 -1.7 2.6 h-10.6 q-2.7 0 -1.7 -2.6 Z" fill="var(--p-accent)"/>' +
      '<circle cx="51.5" cy="46.5" r="1.3" fill="var(--p-accent)" opacity=".7"/>' +
      '<circle cx="54.5" cy="43.5" r="1" fill="var(--p-accent)" opacity=".55"/>' +
      '<path d="M47 39 q-4 4 0 9" stroke="var(--p-dark)" stroke-width="2.4" fill="none" ' +
        'stroke-linecap="round" opacity=".55"/>' +
      // la toque : plateau, facette claire pour le relief, bandeau, bouton, pompon
      '<path d="M23.5 17.5 q8.5 5.5 17 0 l0 4 q-8.5 5.5 -17 0 z" fill="var(--p-accent)" opacity=".75"/>' +
      '<path d="M32 9 L52 16.5 L32 24 L12 16.5 Z" fill="var(--p-accent)"/>' +
      '<path d="M32 9 L52 16.5 L32 16.5 Z" fill="#fff" opacity=".18"/>' +
      '<circle cx="32" cy="16.5" r="1.9" fill="#fff" opacity=".9"/>' +
      '<path d="M32 16.5 L49.5 18.2 L49.5 26" fill="none" stroke="#fff" stroke-width="1.5" ' +
        'opacity=".85" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M49.5 25.5 L49.5 30.5" stroke="var(--p-accent)" stroke-width="3.4" stroke-linecap="round"/>',
    // 🎮 manette tenue à deux ailerons + pixels qui s'échappent
    // Le seul accessoire tenu de face et bien centré : reste lisible à 30px,
    // et ne réutilise ni casque (music) ni lunettes (finance, media).
    gaming:
      // la manette, posée en travers du ventre
      '<path d="M19 42.5 q13 -3 26 0 q3.5 1 3.5 5.5 q0 7.5 -5.5 7.5 q-4 0 -6 -3.5 h-10 ' +
        'q-2 3.5 -6 3.5 q-5.5 0 -5.5 -7.5 q0 -4.5 3.5 -5.5 z" fill="var(--p-accent)"/>' +
      '<path d="M19 42.5 q13 -3 26 0 q2 .6 2.9 2.4 q-14 -2.6 -31.8 0 q.9 -1.8 2.9 -2.4 z" ' +
        'fill="#fff" opacity=".22"/>' +
      // croix directionnelle
      '<path d="M25 46.6 h2.4 v-2.4 h2.4 v2.4 h2.4 v2.4 h-2.4 v2.4 h-2.4 v-2.4 h-2.4 z" ' +
        'fill="#fff" opacity=".92"/>' +
      // les deux boutons d\'action
      '<circle cx="38.6" cy="46.4" r="1.9" fill="#fff" opacity=".92"/>' +
      '<circle cx="42.2" cy="49.2" r="1.9" fill="#fff" opacity=".92"/>' +
      // les ailerons ramenés sur la manette
      '<path d="M19.5 38 q-3 5 1.5 8" stroke="var(--p-dark)" stroke-width="2.4" fill="none" ' +
        'stroke-linecap="round" opacity=".55"/>' +
      '<path d="M44.5 38 q3 5 -1.5 8" stroke="var(--p-dark)" stroke-width="2.4" fill="none" ' +
        'stroke-linecap="round" opacity=".55"/>' +
      // pixels qui s\'échappent de la partie
      '<rect x="9" y="18" width="3.4" height="3.4" rx=".7" fill="var(--p-accent)"/>' +
      '<rect x="15" y="11" width="2.6" height="2.6" rx=".6" fill="var(--p-accent)" opacity=".7"/>' +
      '<rect x="50" y="14" width="3" height="3" rx=".7" fill="var(--p-accent)" opacity=".85"/>' +
      '<rect x="56" y="22" width="2.4" height="2.4" rx=".6" fill="var(--p-accent)" opacity=".6"/>',
    // 🧣 écharpe discrète
    default:
      '<path d="M21 40 q11 6 22 0 l0 5 q-11 6 -22 0 z" fill="var(--p-accent)"/>' +
      '<path d="M41 44 l4 10 l-5 1.5 l-2.5 -9 z" fill="var(--p-accent)"/>'
    };

  function penguinSVG(theme) {
    return (
      '<svg class="mascot" viewBox="0 0 64 64" aria-hidden="true" focusable="false">' +
        penguinBody() +
        (ACCESSORIES[theme] || ACCESSORIES.default) +
      '</svg>'
    );
  }

  // --- Styles (isolés dans le Shadow DOM) ---------------------------------
  var CSS = [
    // Cascade de couleurs, du moins au plus prioritaire :
    //   --_auto-*  échantillonné sur le site (écrit en inline par sniffPalette)
    //   --orbit-header-*  surcharge explicite du site
    //   attribut accent="…"  surcharge la plus forte (inline sur .bar)
    ':host{display:block;',
      '--_auto-bg:rgba(255,255,255,.78);--_auto-solid:#fff;--_auto-text:#0f172a;',
      '--_auto-border:rgba(15,23,42,.10);--_auto-accent:#6366F1;',
      '--_bg:var(--orbit-header-bg,var(--_auto-bg));',
      '--_solid:var(--orbit-header-bg,var(--_auto-solid));',
      '--_text:var(--orbit-header-text,var(--_auto-text));',
      '--_border:var(--orbit-header-border,var(--_auto-border));',
      '--_accent:var(--orbit-header-accent,var(--_auto-accent));',
      '--p-dark:#1e293b;--p-light:#f8fafc;--p-beak:#FB923C;--p-accent:var(--_accent);}',
    ':host([hidden]){display:none}',

    '.bar{position:sticky;top:0;z-index:100;background:var(--_bg);color:var(--_text);',
      'border-bottom:1px solid var(--_border);backdrop-filter:blur(10px) saturate(150%);',
      '-webkit-backdrop-filter:blur(10px) saturate(150%);',
      'font:400 .9rem/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;',
      'padding:.7rem 1.25rem;box-sizing:border-box}',
    ':host([static]) .bar{position:static}',
    ':host([solid]) .bar{backdrop-filter:none;-webkit-backdrop-filter:none;',
      'background:var(--_solid)}',
    ':host([compact]) .bar{padding:.45rem 1rem}',

    '.wrap{max-width:1200px;margin:0 auto;display:flex;align-items:center;',
      'justify-content:space-between;gap:1rem}',

    '.brand{display:flex;align-items:center;gap:.7rem;min-width:0;color:inherit;',
      'text-decoration:none;flex-shrink:1}',
    '.mascot{width:38px;height:38px;flex-shrink:0;display:block;',
      'transition:transform .35s cubic-bezier(.34,1.56,.64,1)}',
    ':host([compact]) .mascot{width:30px;height:30px}',
    '.brand:hover .mascot,.brand:focus-visible .mascot{transform:translateY(-3px) rotate(-6deg) scale(1.08)}',
    '.name{font-weight:650;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;',
      'text-overflow:ellipsis;font-size:.98rem}',
    ':host([compact]) .name{font-size:.9rem}',

    'nav{display:flex;align-items:center;gap:1.15rem;flex-shrink:0}',
    'nav a{font-size:.85rem;color:inherit;text-decoration:none;opacity:.72;',
      'white-space:nowrap;transition:opacity .2s,color .2s;border-radius:4px}',
    'nav a:hover{opacity:1;color:var(--_accent)}',
    'nav a:focus-visible,.brand:focus-visible{outline:2px solid var(--_accent);outline-offset:3px}',

    '.badge{display:inline-flex;align-items:center;gap:.4rem;font-size:.72rem;',
      'letter-spacing:.02em;opacity:.6;border-left:1px solid var(--_border);',
      'padding-left:.95rem;white-space:nowrap}',
    '.dot{width:6px;height:6px;border-radius:50%;background:var(--_accent);flex-shrink:0;',
      'box-shadow:0 0 0 3px color-mix(in srgb,var(--_accent) 22%,transparent)}',

    // Sur fond sombre, le corps du pingouin doit s'éclaircir pour rester lisible
    '.bar[data-scheme="dark"]{--p-dark:#475569}',

    // Responsive : le badge puis les liens secondaires s'effacent
    '@media (max-width:680px){.badge{display:none}nav{gap:.9rem}.bar{padding:.6rem .9rem}}',
    '@media (max-width:420px){nav a.optional{display:none}.name{font-size:.9rem}}',

    '@media (prefers-reduced-motion:reduce){.mascot{transition:none}',
      '.brand:hover .mascot{transform:none}}'
  ].join('');

  // --- Utilitaires ---------------------------------------------------------
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // "Docs:/docs, Blog:https://…" → [{label,url}]
  function parseLinks(raw) {
    if (!raw) return [];
    return raw.split(',').map(function (chunk) {
      var i = chunk.indexOf(':');
      if (i < 0) return null;
      var label = chunk.slice(0, i).trim();
      var url = chunk.slice(i + 1).trim();
      return label && url ? { label: label, url: url } : null;
    }).filter(Boolean);
  }

  function safeUrl(url) {
    // Bloque javascript: / data: — on n'accepte que http(s), relatif, ancre, mailto
    var u = String(url).trim();
    return /^(https?:\/\/|\/|\.|#|mailto:)/i.test(u) ? u : '#';
  }

  // --- Échantillonnage des couleurs réelles du site ------------------------

  var PROBE = null;
  /** Normalise n'importe quelle valeur CSS de couleur en [r,g,b,a], ou null. */
  function toRGB(value) {
    if (!value) return null;
    var v = String(value).trim();
    if (!v || v === 'none' || v === 'transparent') return null;
    if (!PROBE) {
      PROBE = document.createElement('span');
      PROBE.style.cssText = 'position:absolute;width:0;height:0;visibility:hidden';
    }
    // Le navigateur fait le parsing pour nous : hex, hsl(), oklch(), nom CSS…
    PROBE.style.color = '';
    PROBE.style.color = v;
    if (!PROBE.style.color) return null; // valeur refusée = pas une couleur
    (document.body || document.documentElement).appendChild(PROBE);
    var computed = getComputedStyle(PROBE).color;
    PROBE.remove();
    var m = /rgba?\(([^)]+)\)/.exec(computed);
    if (!m) return null;
    var p = m[1].split(/[,\s/]+/).filter(Boolean).map(parseFloat);
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  }

  function luminance(rgb) {
    return (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
  }
  function rgba(c, a) {
    return 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + a + ')';
  }

  // Noms de variables d'accent les plus répandus, testés dans l'ordre.
  var ACCENT_VARS = [
    '--orbit-header-accent', '--accent', '--accent-color', '--color-accent',
    '--primary', '--primary-color', '--color-primary', '--brand', '--brand-color',
    '--theme-color', '--ring', '--highlight'
  ];

  /**
   * Lit les couleurs effectives de la page hôte :
   *  - le fond réel (premier ancêtre non transparent) → fond translucide du header
   *  - la couleur de texte réelle → texte et bordures du header
   *  - une variable d'accent du site (--accent, --primary, …) si elle existe
   * Tout est dérivé du site, pas d'une palette figée.
   */
  function sniffPalette(el, accentVarAttr) {
    var out = {};

    // 1. Fond : on remonte jusqu'au premier ancêtre réellement peint.
    var bg = null;
    for (var n = el; n; n = n.parentElement) {
      var c = toRGB(getComputedStyle(n).backgroundColor);
      if (c && c[3] >= 0.1) { bg = c; break; }
    }
    if (!bg) {
      // Aucun fond peint : on retombe sur la préférence système.
      bg = matchMedia('(prefers-color-scheme:dark)').matches ? [15, 23, 42, 1] : [255, 255, 255, 1];
    }
    out.scheme = luminance(bg) < 0.5 ? 'dark' : 'light';
    out.bg = rgba(bg, out.scheme === 'dark' ? 0.72 : 0.78);
    out.solid = rgba(bg, 1);

    // 2. Texte : la couleur héritée à l'emplacement exact du header, pour suivre
    //    un conteneur qui redéfinirait la couleur localement.
    var fg = toRGB(getComputedStyle(el).color);
    if (!fg || Math.abs(luminance(fg) - luminance(bg)) < 0.25) {
      // Contraste insuffisant (ou illisible) → on force un texte sûr.
      fg = out.scheme === 'dark' ? [226, 232, 240, 1] : [15, 23, 42, 1];
    }
    out.text = rgba(fg, 1);
    out.border = rgba(fg, out.scheme === 'dark' ? 0.14 : 0.1);

    // 3. Accent : la variable CSS du site si on en trouve une exploitable.
    //    Lu depuis l'élément lui-même : les custom properties héritant, on voit
    //    aussi bien celles de :root que celles d'un conteneur intermédiaire.
    var rootStyle = getComputedStyle(el);
    var names = accentVarAttr ? [accentVarAttr].concat(ACCENT_VARS) : ACCENT_VARS;
    for (var i = 0; i < names.length; i++) {
      var a = toRGB(rootStyle.getPropertyValue(names[i]));
      // On écarte les accents qui se noieraient dans le fond du header.
      if (a && a[3] > 0.5 && Math.abs(luminance(a) - luminance(bg)) > 0.15) {
        out.accent = rgba(a, 1);
        break;
      }
    }
    return out;
  }

  var OBSERVED = ['app-name', 'theme', 'accent', 'accent-var', 'hub-url', 'github',
                  'links', 'badge', 'appearance', 'solid', 'static', 'compact'];

  // --- Le composant --------------------------------------------------------
  class OrbitHeader extends HTMLElement {
    static get observedAttributes() { return OBSERVED; }

    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
      this.render();

      // Le site peut changer de couleurs après coup. Trois déclencheurs :
      this._sync = this.applyPalette.bind(this);

      // 1. bascule clair/sombre du système
      this._mq = matchMedia('(prefers-color-scheme:dark)');
      this._mq.addEventListener('change', this._sync);

      // 2. toggle de thème maison — quasiment tous passent par une classe ou un
      //    data-attribute sur <html>/<body> (.dark, data-theme="…", style inline)
      this._mo = new MutationObserver(this._sync);
      var opts = { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] };
      this._mo.observe(document.documentElement, opts);
      if (document.body) this._mo.observe(document.body, opts);

      // 3. le CSS du site peut arriver après nous (feuille async, hydratation)
      this._raf = requestAnimationFrame(this._sync);
    }

    disconnectedCallback() {
      if (this._mq) this._mq.removeEventListener('change', this._sync);
      if (this._mo) this._mo.disconnect();
      cancelAnimationFrame(this._raf);
    }

    /** Force une réévaluation des couleurs (après un toggle de thème maison). */
    refresh() { this.applyPalette(); }

    /**
     * Échantillonne le site et écrit les couleurs sur l'hôte. Séparé de render()
     * pour pouvoir resynchroniser sans reconstruire le DOM du header.
     */
    applyPalette() {
      var appearance = this.attr('appearance', 'auto');
      var p = sniffPalette(this, this.getAttribute('accent-var'));
      var scheme = appearance === 'auto' ? p.scheme : appearance;

      if (appearance === 'auto') {
        this.style.setProperty('--_auto-bg', p.bg);
        this.style.setProperty('--_auto-solid', p.solid);
        this.style.setProperty('--_auto-text', p.text);
        this.style.setProperty('--_auto-border', p.border);
      }
      // L'accent du site prime sur celui du thème, mais jamais sur accent="…".
      if (p.accent && !this.getAttribute('accent')) {
        this.style.setProperty('--_auto-accent', p.accent);
      }

      var bar = this.shadowRoot && this.shadowRoot.querySelector('.bar');
      if (bar) bar.dataset.scheme = scheme;
    }

    attributeChangedCallback() { if (this.shadowRoot) this.render(); }

    attr(name, fallback) {
      var v = this.getAttribute(name);
      return v === null || v === '' ? fallback : v;
    }

    render() {
      var themeName = this.attr('theme', 'default');
      var theme = THEMES[themeName] || THEMES.default;
      var accentAttr = this.getAttribute('accent');

      // Accent par défaut du thème — sniffPalette l'écrasera si le site expose
      // sa propre variable ; l'attribut accent="…" reste prioritaire sur tout.
      this.style.setProperty('--_auto-accent', theme.accent);

      var appName = this.attr('app-name', 'Orbit');
      var hubUrl = safeUrl(this.attr('hub-url', HUB_URL));
      var github = this.getAttribute('github');
      var badge = this.getAttribute('badge');
      if (badge === null) badge = theme.label;

      var extra = parseLinks(this.getAttribute('links')).map(function (l) {
        return '<a class="optional" href="' + esc(safeUrl(l.url)) + '">' + esc(l.label) + '</a>';
      }).join('');

      var githubLink = github
        ? '<a class="optional" href="' + esc(safeUrl(github)) +
          '" target="_blank" rel="noopener noreferrer">GitHub</a>'
        : '';

      var badgeHtml = (badge && badge !== 'none')
        ? '<span class="badge"><span class="dot"></span>' + esc(badge) + '</span>'
        : '';

      this.shadowRoot.innerHTML =
        '<style>' + CSS + '</style>' +
        '<header class="bar" part="bar"' +
          (accentAttr ? ' style="--_accent:' + esc(accentAttr) + '"' : '') + '>' +
          '<div class="wrap">' +
            '<a class="brand" href="' + esc(hubUrl) + '" aria-label="' + esc(appName) +
              ' — retour au hub Orbit">' +
              penguinSVG(themeName) +
              '<span class="name">' + esc(appName) + '</span>' +
            '</a>' +
            '<nav aria-label="Réseau Orbit">' +
              extra +
              '<a href="' + esc(hubUrl) + '">Hub</a>' +
              githubLink +
              badgeHtml +
            '</nav>' +
          '</div>' +
        '</header>';

      this.applyPalette();
    }
  }

  if (!customElements.get('orbit-header')) {
    customElements.define('orbit-header', OrbitHeader);
  }
})();
