/*!
 * Orbit — Écran de chargement (<orbit-splash>)
 * Web Component autonome, sans dépendance, sans asset externe.
 * Compagnon de <orbit-header> : même mascotte, même échantillonnage de couleurs.
 *
 *   <script src="https://orbit-umber-sigma.vercel.app/orbit-splash.js"></script>
 *   <orbit-splash app-name="Atlas" theme="travel"></orbit-splash>
 *
 * À placer en PREMIER enfant de <body>, et le script SANS defer dans <head> :
 * le splash doit couvrir la page avant qu'elle ne peigne quoi que ce soit.
 *
 * Attributs (tous optionnels) :
 *   app-name   — nom qui se révèle sous la mascotte        (défaut: "Orbit")
 *   theme      — space | music | finance | media | travel | video | study | gaming | default
 *   accent     — couleur d'accent CSS, écrase le thème ET la détection
 *   accent-var — variable CSS du site à utiliser comme accent, ex. "--gold"
 *   tagline    — texte sous le nom ; "" ou "none" pour le retirer (défaut: "Réseau Orbit")
 *   duration   — ms d'intro avant la sortie              (défaut: 3000, min 3000)
 *   once       — session | always                          (défaut: "session")
 *                "session" = une fois par onglet : un rechargement ou un retour
 *                sur l'onglet ne rejoue rien, ouvrir le site dans un nouvel
 *                onglet rejoue la mise en scène.
 *   appearance — auto | light | dark                       (défaut: auto)
 *   manual     — présent = ne se ferme pas tout seul ; le site appelle .finish()
 *                (un filet de sécurité ferme quand même à 8 s)
 *
 * API : document.querySelector('orbit-splash').finish()
 * Événement : 'orbit-splash-done' émis sur window à la fin de la sortie.
 */
(function () {
  'use strict';

  var THEMES = {
    default: '#6366F1', space: '#22D3EE', music: '#34D399', finance: '#F59E0B',
    media: '#A78BFA', travel: '#FB923C', video: '#FF3D2E', study: '#6366F1',
    gaming: '#F43F5E'
  };

  // --- Mascotte : identique au header, corps + accessoire par thème ---------
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
    space:
      '<ellipse cx="32" cy="32" rx="22" ry="21" fill="var(--p-accent)" opacity=".16"/>' +
      '<ellipse cx="32" cy="32" rx="22" ry="21" fill="none" stroke="var(--p-accent)" stroke-width="2"/>' +
      '<path d="M14 22 A22 21 0 0 1 30 12" fill="none" stroke="#fff" stroke-width="2.5" opacity=".7" stroke-linecap="round"/>' +
      '<ellipse cx="32" cy="34" rx="30" ry="9" fill="none" stroke="var(--p-accent)" stroke-width="1.6" opacity=".75" transform="rotate(-22 32 34)"/>' +
      '<circle cx="57" cy="24" r="2.4" fill="var(--p-accent)"/>',
    music:
      '<path d="M16 28 A16 16 0 0 1 48 28" fill="none" stroke="var(--p-accent)" stroke-width="3.4" stroke-linecap="round"/>' +
      '<rect x="10" y="26" width="8" height="13" rx="4" fill="var(--p-accent)"/>' +
      '<rect x="46" y="26" width="8" height="13" rx="4" fill="var(--p-accent)"/>' +
      '<path d="M52 10 L52 19" stroke="var(--p-accent)" stroke-width="2" stroke-linecap="round"/>' +
      '<circle cx="50" cy="20" r="2.6" fill="var(--p-accent)"/>' +
      '<path d="M52 10 L58 8" stroke="var(--p-accent)" stroke-width="2" stroke-linecap="round"/>',
    finance:
      '<path d="M25 44 L32 38 L39 44 L36 58 L28 58 Z" fill="var(--p-accent)"/>' +
      '<path d="M32 36 L28 40 L32 43 L36 40 Z" fill="var(--p-accent)"/>' +
      '<rect x="20" y="25.5" width="10" height="7.5" rx="2" fill="none" stroke="#111" stroke-width="1.6" opacity=".85"/>' +
      '<rect x="34" y="25.5" width="10" height="7.5" rx="2" fill="none" stroke="#111" stroke-width="1.6" opacity=".85"/>' +
      '<path d="M30 29 h4" stroke="#111" stroke-width="1.6" opacity=".85"/>',
    media:
      '<rect x="19.5" y="25" width="11" height="7.5" rx="1.5" fill="#EF4444" opacity=".85"/>' +
      '<rect x="33.5" y="25" width="11" height="7.5" rx="1.5" fill="#3B82F6" opacity=".85"/>' +
      '<path d="M30.5 28.5 h3" stroke="#111" stroke-width="1.6"/>' +
      '<path d="M44 44 L52 44 L50 60 L46 60 Z" fill="#fff"/>' +
      '<path d="M44 44 L52 44 L51 50 L45 50 Z" fill="var(--p-accent)"/>' +
      '<circle cx="45.5" cy="42" r="2.6" fill="#FDE68A"/><circle cx="50" cy="41" r="2.2" fill="#FEF3C7"/>' +
      '<circle cx="48" cy="44" r="2.4" fill="#FDE68A"/>',
    travel:
      '<path d="M12 22 q20 6 40 0 q-6 5 -20 5 q-14 0 -20 -5 z" fill="var(--p-accent)"/>' +
      '<path d="M21 22 q11 -14 22 0 z" fill="var(--p-accent)"/>' +
      '<path d="M20.5 21 q11.5 3 23 0" stroke="#7C2D12" stroke-width="2.2" fill="none" opacity=".65"/>' +
      '<path d="M24 40 L40 52" stroke="var(--p-accent)" stroke-width="3.2" stroke-linecap="round" opacity=".9"/>' +
      '<circle cx="33" cy="46.5" r="2.6" fill="#7C2D12"/>',
    video:
      '<rect x="39" y="38" width="19" height="14" rx="4.5" fill="var(--p-accent)"/>' +
      '<path d="M45.5 41.8 L52.5 45 L45.5 48.2 Z" fill="#fff"/>' +
      '<path d="M44 40 q-4 4 0 9" stroke="var(--p-dark)" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".55"/>' +
      '<circle cx="11" cy="17" r="1.9" fill="var(--p-accent)"/>' +
      '<circle cx="18" cy="10" r="1.4" fill="var(--p-accent)" opacity=".75"/>' +
      '<circle cx="52" cy="13" r="1.6" fill="var(--p-accent)" opacity=".85"/>',
    study:
      '<rect x="51" y="35.5" width="4" height="5.5" rx="1" fill="var(--p-accent)" opacity=".85"/>' +
      '<path d="M51 41 L47.5 53 q-1 2.6 1.7 2.6 h10.6 q2.7 0 1.7 -2.6 L55 41 Z" fill="#fff" opacity=".92" stroke="var(--p-accent)" stroke-width="1.5" stroke-linejoin="round"/>' +
      '<path d="M48.6 49.5 h9.8 l1 3.5 q1 2.6 -1.7 2.6 h-10.6 q-2.7 0 -1.7 -2.6 Z" fill="var(--p-accent)"/>' +
      '<circle cx="51.5" cy="46.5" r="1.3" fill="var(--p-accent)" opacity=".7"/>' +
      '<path d="M47 39 q-4 4 0 9" stroke="var(--p-dark)" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".55"/>' +
      '<path d="M23.5 17.5 q8.5 5.5 17 0 l0 4 q-8.5 5.5 -17 0 z" fill="var(--p-accent)" opacity=".75"/>' +
      '<path d="M32 9 L52 16.5 L32 24 L12 16.5 Z" fill="var(--p-accent)"/>' +
      '<path d="M32 9 L52 16.5 L32 16.5 Z" fill="#fff" opacity=".18"/>' +
      '<circle cx="32" cy="16.5" r="1.9" fill="#fff" opacity=".9"/>' +
      '<path d="M32 16.5 L49.5 18.2 L49.5 26" fill="none" stroke="#fff" stroke-width="1.5" opacity=".85" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M49.5 25.5 L49.5 30.5" stroke="var(--p-accent)" stroke-width="3.4" stroke-linecap="round"/>',
    gaming:
      '<path d="M19 42.5 q13 -3 26 0 q3.5 1 3.5 5.5 q0 7.5 -5.5 7.5 q-4 0 -6 -3.5 h-10 ' +
        'q-2 3.5 -6 3.5 q-5.5 0 -5.5 -7.5 q0 -4.5 3.5 -5.5 z" fill="var(--p-accent)"/>' +
      '<path d="M25 46.6 h2.4 v-2.4 h2.4 v2.4 h2.4 v2.4 h-2.4 v2.4 h-2.4 v-2.4 h-2.4 z" fill="#fff" opacity=".92"/>' +
      '<circle cx="38.6" cy="46.4" r="1.9" fill="#fff" opacity=".92"/>' +
      '<circle cx="42.2" cy="49.2" r="1.9" fill="#fff" opacity=".92"/>' +
      '<path d="M19.5 38 q-3 5 1.5 8" stroke="var(--p-dark)" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".55"/>' +
      '<path d="M44.5 38 q3 5 -1.5 8" stroke="var(--p-dark)" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".55"/>' +
      '<rect x="9" y="18" width="3.4" height="3.4" rx=".7" fill="var(--p-accent)"/>' +
      '<rect x="50" y="14" width="3" height="3" rx=".7" fill="var(--p-accent)" opacity=".85"/>',
    default:
      '<path d="M21 40 q11 6 22 0 l0 5 q-11 6 -22 0 z" fill="var(--p-accent)"/>' +
      '<path d="M41 44 l4 10 l-5 1.5 l-2.5 -9 z" fill="var(--p-accent)"/>'
  };

  // --- Utilitaires (échantillonnage : même logique que le header) -----------
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var PROBE = null;
  function toRGB(value) {
    if (!value) return null;
    var v = String(value).trim();
    if (!v || v === 'none' || v === 'transparent') return null;
    if (!PROBE) {
      PROBE = document.createElement('span');
      PROBE.style.cssText = 'position:absolute;width:0;height:0;visibility:hidden';
    }
    PROBE.style.color = '';
    PROBE.style.color = v;
    if (!PROBE.style.color) return null;
    (document.body || document.documentElement).appendChild(PROBE);
    var computed = getComputedStyle(PROBE).color;
    PROBE.remove();
    var m = /rgba?\(([^)]+)\)/.exec(computed);
    if (!m) return null;
    var p = m[1].split(/[,\s/]+/).filter(Boolean).map(parseFloat);
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  }
  function luminance(rgb) { return (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255; }
  function rgba(c, a) {
    return 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + a + ')';
  }

  var ACCENT_VARS = [
    '--orbit-header-accent', '--accent', '--accent-color', '--color-accent',
    '--primary', '--primary-color', '--color-primary', '--brand', '--brand-color',
    '--theme-color', '--ring', '--highlight'
  ];

  /**
   * Le splash couvre TOUTE la page : contrairement au header, le fond pertinent
   * est celui de <body>/<html>, pas celui du parent immédiat.
   */
  function sniffPalette(el, accentVarAttr) {
    var out = {};
    var bg = null;
    var roots = [document.body, document.documentElement];
    for (var i = 0; i < roots.length && !bg; i++) {
      if (!roots[i]) continue;
      var c = toRGB(getComputedStyle(roots[i]).backgroundColor);
      if (c && c[3] >= 0.1) bg = c;
    }
    if (!bg) {
      bg = matchMedia('(prefers-color-scheme:dark)').matches ? [15, 23, 42, 1] : [255, 255, 255, 1];
    }
    out.scheme = luminance(bg) < 0.5 ? 'dark' : 'light';
    out.bg = rgba(bg, 1);

    var fg = toRGB(getComputedStyle(document.body || document.documentElement).color);
    if (!fg || Math.abs(luminance(fg) - luminance(bg)) < 0.25) {
      fg = out.scheme === 'dark' ? [226, 232, 240, 1] : [15, 23, 42, 1];
    }
    out.text = rgba(fg, 1);

    // Lu sur l'élément lui-même : les custom properties héritent, donc on voit
    // aussi bien celles de :root que celles posées sur <body>.
    var style = getComputedStyle(el);
    var names = accentVarAttr ? [accentVarAttr].concat(ACCENT_VARS) : ACCENT_VARS;
    for (var j = 0; j < names.length; j++) {
      var a = toRGB(style.getPropertyValue(names[j]));
      if (a && a[3] > 0.5 && Math.abs(luminance(a) - luminance(bg)) > 0.15) {
        out.accent = rgba(a, 1);
        break;
      }
    }
    return out;
  }

  // --- Styles (isolés dans le Shadow DOM) ----------------------------------
  var R = 54;                       // rayon de l'anneau, dans le viewBox 140×140
  var C = 2 * Math.PI * R;          // circonférence, pour le tracé progressif

  var CSS = [
    ':host{position:fixed;inset:0;z-index:2147483000;display:block;',
      '--_bg:#fff;--_text:#0f172a;--_accent:#6366F1;',
      '--p-dark:#1e293b;--p-light:#f8fafc;--p-beak:#FB923C;--p-accent:var(--_accent);}',
    ':host([hidden]){display:none}',

    // Les deux panneaux forment le fond : ils s'écartent pour révéler la page.
    '.panel{position:absolute;left:0;right:0;height:50.2%;background:var(--_bg);',
      'transition:transform .72s cubic-bezier(.76,0,.24,1)}',
    '.panel.top{top:0}.panel.bottom{bottom:0}',
    '.stage.out .panel.top{transform:translateY(-100%)}',
    '.stage.out .panel.bottom{transform:translateY(100%)}',

    '.stage{position:absolute;inset:0;overflow:hidden}',
    '.content{position:absolute;inset:0;display:flex;flex-direction:column;',
      'align-items:center;justify-content:center;gap:1.15rem;color:var(--_text);',
      'font:400 1rem/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;',
      'transition:opacity .3s ease,transform .3s ease}',
    '.stage.out .content{opacity:0;transform:scale(.94)}',

    // Le bloc mascotte + anneau + satellite
    '.orb{position:relative;width:140px;height:140px;display:grid;place-items:center}',
    '.halo{position:absolute;inset:6px;border-radius:50%;background:var(--_accent);',
      'opacity:0;filter:blur(22px);animation:halo 1.9s .2s ease-out forwards}',
    '.ring{position:absolute;inset:0;width:100%;height:100%;transform:rotate(-90deg)}',
    '.ring circle{fill:none;stroke:var(--_accent);stroke-width:2.5;stroke-linecap:round;',
      'stroke-dasharray:' + C.toFixed(1) + ';stroke-dashoffset:' + C.toFixed(1) + ';',
      'animation:draw 1.4s .25s cubic-bezier(.65,0,.35,1) forwards}',
    '.sat{position:absolute;inset:0;opacity:0;',
      'animation:fadein .5s .7s ease forwards,spin 3.4s .7s linear infinite}',
    '.sat i{position:absolute;top:calc(50% - ' + R + 'px - 4px);left:calc(50% - 4px);',
      'width:8px;height:8px;border-radius:50%;background:var(--_accent);',
      'box-shadow:0 0 0 4px color-mix(in srgb,var(--_accent) 25%,transparent)}',
    '.mascot{position:relative;width:78px;height:78px;transform-origin:50% 70%;',
      'animation:pop .75s cubic-bezier(.34,1.56,.64,1) forwards,',
      'bob 2.6s .75s ease-in-out infinite}',

    '.name{display:flex;gap:.02em;font-weight:680;letter-spacing:-.015em;',
      'font-size:clamp(1.5rem,5.5vw,2.1rem);white-space:pre}',
    '.name span{display:inline-block;opacity:0;transform:translateY(14px);',
      'animation:rise .62s cubic-bezier(.22,1,.36,1) forwards}',
    '.tag{display:inline-flex;align-items:center;gap:.5rem;font-size:.76rem;',
      'letter-spacing:.05em;text-transform:uppercase;opacity:0;',
      'animation:fadeup .5s ease forwards}',
    '.tag b{width:6px;height:6px;border-radius:50%;background:var(--_accent);',
      'box-shadow:0 0 0 3px color-mix(in srgb,var(--_accent) 22%,transparent)}',

    '@keyframes draw{to{stroke-dashoffset:0}}',
    '@keyframes spin{to{transform:rotate(360deg)}}',
    '@keyframes fadein{to{opacity:1}}',
    '@keyframes halo{0%{opacity:0;transform:scale(.7)}55%{opacity:.22}100%{opacity:.13;transform:scale(1)}}',
    '@keyframes pop{0%{opacity:0;transform:scale(.35) translateY(18px)}',
      '62%{opacity:1;transform:scale(1.1) translateY(-5px)}',
      '100%{opacity:1;transform:scale(1) translateY(0)}}',
    '@keyframes bob{0%,100%{transform:translateY(0) rotate(0)}',
      '35%{transform:translateY(-5px) rotate(-4deg)}70%{transform:translateY(-2px) rotate(3deg)}}',
    '@keyframes rise{to{opacity:1;transform:none}}',
    '@keyframes fadeup{from{opacity:0;transform:translateY(8px)}to{opacity:.62;transform:none}}',

    // Mouvement réduit : plus de mise en scène, juste la marque puis un fondu.
    '@media (prefers-reduced-motion:reduce){',
      '.mascot,.sat,.halo,.ring circle,.name span,.tag{animation:none!important}',
      '.mascot,.name span{opacity:1;transform:none}.tag{opacity:.62}',
      '.halo{opacity:.13}.ring circle{stroke-dashoffset:0}',
      '.panel{transition:opacity .3s linear}',
      '.stage.out .panel{opacity:0;transform:none}}'
  ].join('');

  var SAFETY_MS = 8000;  // le splash ne doit JAMAIS rester coincé sur la page

  class OrbitSplash extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._done = false;
    }

    connectedCallback() {
      // Rejoué à chaque onglet, pas à chaque rechargement : sur une app qu'on
      // utilise tous les jours, revoir la mise en scène en boucle est pénible.
      var key = 'orbit-splash:' + this.attr('app-name', 'Orbit');
      if (this.attr('once', 'session') !== 'always') {
        var seen = null;
        try { seen = sessionStorage.getItem(key); } catch (e) { /* mode privé */ }
        if (seen) { this.remove(); return; }
        try { sessionStorage.setItem(key, '1'); } catch (e) { /* ignoré */ }
      }

      this.render();

      // La page ne doit pas défiler derrière le splash.
      this._prevOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = 'hidden';

      var reduced = matchMedia('(prefers-reduced-motion:reduce)').matches;
      // Plancher à 3 s : la mise en scène doit avoir le temps de se dérouler
      // en entier, même sur un site qui se charge instantanément.
      var d = Math.max(3000, parseInt(this.attr('duration', '3000'), 10) || 3000);
      var wait = this.hasAttribute('manual') ? SAFETY_MS : (reduced ? 700 : d);
      this._timer = setTimeout(this.finish.bind(this), wait);
      if (this.hasAttribute('manual')) this._safety = this._timer;
    }

    disconnectedCallback() { clearTimeout(this._timer); this._restore(); }

    attr(name, fallback) {
      var v = this.getAttribute(name);
      return v === null || v === '' ? fallback : v;
    }

    _restore() {
      if (this._prevOverflow !== undefined) {
        document.documentElement.style.overflow = this._prevOverflow;
        this._prevOverflow = undefined;
      }
    }

    /** Lance la sortie : les panneaux s'écartent, puis l'élément se retire. */
    finish() {
      if (this._done) return;
      this._done = true;
      clearTimeout(this._timer);

      var stage = this.shadowRoot.querySelector('.stage');
      if (!stage) { this._end(); return; }
      stage.classList.add('out');

      var panel = stage.querySelector('.panel');
      var ended = false;
      var end = function () { if (!ended) { ended = true; this._end(); } }.bind(this);
      panel.addEventListener('transitionend', end, { once: true });
      // Filet : si la transition ne se déclenche pas (onglet en arrière-plan…).
      setTimeout(end, 1200);
    }

    _end() {
      this._restore();
      window.dispatchEvent(new CustomEvent('orbit-splash-done'));
      this.remove();
    }

    render() {
      var themeName = this.attr('theme', 'default');
      var p = sniffPalette(this, this.getAttribute('accent-var'));
      var appearance = this.attr('appearance', 'auto');
      if (appearance === 'dark') { p.bg = '#0b1120'; p.text = '#e2e8f0'; p.scheme = 'dark'; }
      if (appearance === 'light') { p.bg = '#ffffff'; p.text = '#0f172a'; p.scheme = 'light'; }

      // Priorité : attribut accent > variable du site > accent du thème.
      var accent = this.getAttribute('accent') || p.accent || THEMES[themeName] || THEMES.default;
      this.style.setProperty('--_bg', p.bg);
      this.style.setProperty('--_text', p.text);
      this.style.setProperty('--_accent', accent);
      if (p.scheme === 'dark') this.style.setProperty('--p-dark', '#475569');

      var appName = this.attr('app-name', 'Orbit');
      // Cadence lente et lisible ; resserrée sur un nom long pour que la
      // révélation soit terminée avant que la sortie ne commence (3 s).
      var step = Math.min(0.075, 1.5 / Math.max(1, appName.length));
      var letters = appName.split('').map(function (ch, i) {
        return '<span style="animation-delay:' + (0.85 + i * step).toFixed(2) + 's">' +
          (ch === ' ' ? '&nbsp;' : esc(ch)) + '</span>';
      }).join('');

      var tagline = this.attr('tagline', 'Réseau Orbit');
      var tagDelay = (0.85 + appName.length * step + 0.2).toFixed(2);
      var tagHtml = (tagline && tagline !== 'none')
        ? '<div class="tag" style="animation-delay:' + tagDelay + 's"><b></b>' + esc(tagline) + '</div>'
        : '';

      this.shadowRoot.innerHTML =
        '<style>' + CSS + '</style>' +
        '<div class="stage" role="status" aria-live="polite" aria-label="Chargement de ' +
          esc(appName) + '">' +
          '<div class="panel top"></div><div class="panel bottom"></div>' +
          '<div class="content">' +
            '<div class="orb">' +
              '<div class="halo"></div>' +
              '<svg class="ring" viewBox="0 0 140 140" aria-hidden="true">' +
                '<circle cx="70" cy="70" r="' + R + '"/></svg>' +
              '<div class="sat"><i></i></div>' +
              '<svg class="mascot" viewBox="0 0 64 64" aria-hidden="true" focusable="false">' +
                penguinBody() + (ACCESSORIES[themeName] || ACCESSORIES.default) +
              '</svg>' +
            '</div>' +
            '<div class="name" aria-hidden="true">' + letters + '</div>' +
            tagHtml +
          '</div>' +
        '</div>';
    }
  }

  if (!customElements.get('orbit-splash')) {
    customElements.define('orbit-splash', OrbitSplash);
  }
})();
