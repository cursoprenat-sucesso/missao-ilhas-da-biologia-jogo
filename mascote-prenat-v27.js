(() => {
  const LAST_PHASE_KEY = 'prenat_quimica_mascot_last_phase_v27';
  const STORAGE_PREFIX = 'prenat_quimica_progress_';
  let observer = null;
  let mapTimer = null;

  function boot() {
    const app = document.getElementById('app');
    if (!app) return;
    observer = new MutationObserver(() => {
      clearTimeout(mapTimer);
      mapTimer = setTimeout(() => {
        enhanceMapMascot();
        enhanceResultMascot();
      }, 90);
    });
    observer.observe(app, { childList: true, subtree: true });
    setTimeout(() => { enhanceMapMascot(); enhanceResultMascot(); }, 320);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  function latestProgress() {
    try {
      const keys = Object.keys(localStorage).filter(k => k.startsWith(STORAGE_PREFIX));
      let best = null;
      for (const key of keys) {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const data = JSON.parse(raw);
        if (!best || (Number(data.xp || 0) + Number(data.coins || 0)) > (Number(best.xp || 0) + Number(best.coins || 0))) best = data;
      }
      return best;
    } catch (_) { return null; }
  }

  function currentPhaseIdFromDom() {
    const current = document.querySelector('.route-map .map-node.current');
    if (current?.dataset?.phaseId) return current.dataset.phaseId;
    const progress = latestProgress();
    if (progress?.unlockedPhase) return String(progress.unlockedPhase);
    const completed = [...document.querySelectorAll('.route-map .map-node.completed')].pop();
    if (completed?.dataset?.phaseId) return completed.dataset.phaseId;
    const first = document.querySelector('.route-map .map-node');
    return first?.dataset?.phaseId || '1';
  }

  function nodePosition(phaseId) {
    const node = document.querySelector(`.route-map .map-node[data-phase-id="${CSS.escape(String(phaseId))}"]`);
    if (!node) return null;
    return { left: node.style.left || '10%', top: node.style.top || '12%', node };
  }

  function ensureStage(routeWrap) {
    let stage = routeWrap.querySelector('.prenat-mascot-stage');
    if (!stage) {
      stage = document.createElement('div');
      stage.className = 'prenat-mascot-stage';
      stage.setAttribute('aria-hidden', 'true');
      stage.innerHTML = mapMascotSvg();
      routeWrap.appendChild(stage);
    }
    return stage;
  }

  function enhanceMapMascot() {
    const routeWrap = document.querySelector('.route-wrap');
    const routeMap = document.querySelector('.route-map');
    if (!routeWrap || !routeMap || !routeMap.querySelector('.map-node')) return;

    const targetPhase = currentPhaseIdFromDom();
    const target = nodePosition(targetPhase);
    if (!target) return;

    const stage = ensureStage(routeWrap);
    const last = sessionStorage.getItem(LAST_PHASE_KEY);
    const previous = last && last !== targetPhase ? nodePosition(last) : null;

    if (previous) {
      stage.style.left = previous.left;
      stage.style.top = previous.top;
      stage.classList.remove('is-arrived');
      stage.classList.add('is-walking');
      addPathPulse(previous.node);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          stage.style.left = target.left;
          stage.style.top = target.top;
          addPathPulse(target.node);
        });
      });
      window.setTimeout(() => {
        stage.classList.remove('is-walking');
        stage.classList.add('is-arrived');
      }, 1580);
    } else {
      stage.style.left = target.left;
      stage.style.top = target.top;
      stage.classList.remove('is-walking');
      stage.classList.add('is-arrived');
    }
    sessionStorage.setItem(LAST_PHASE_KEY, targetPhase);
  }

  function addPathPulse(node) {
    if (!node) return;
    const pulse = document.createElement('span');
    pulse.className = 'prenat-path-glow';
    node.appendChild(pulse);
    window.setTimeout(() => pulse.remove(), 920);
  }

  function enhanceResultMascot() {
    const resultCard = document.querySelector('.result-card');
    if (!resultCard || resultCard.querySelector('.prenat-result-mascot-panel')) return;
    const title = resultCard.querySelector('[data-result-title]')?.textContent || '';
    const kicker = resultCard.querySelector('[data-result-kicker]')?.textContent || '';
    const success = /venceu|conquistada|travessia concluída/i.test(`${title} ${kicker}`);

    const panel = document.createElement('div');
    panel.className = `prenat-result-mascot-panel ${success ? 'success' : 'fail'}`;
    panel.innerHTML = success ? successPanel() : failPanel();

    const stars = resultCard.querySelector('.result-stars');
    if (stars) stars.insertAdjacentElement('afterend', panel);
    else resultCard.insertBefore(panel, resultCard.children[2] || null);

    if (success) adaptSuccessButton(resultCard);
  }

  function adaptSuccessButton(resultCard) {
    const main = resultCard.querySelector('[data-action="result-main"]');
    const back = resultCard.querySelector('[data-action="back-home"]');
    if (!main || !back || main.dataset.mascotMapBound === '1') return;
    main.dataset.mascotMapBound = '1';
    main.textContent = 'Ver avanço no mapa';
    main.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      back.click();
    }, true);
  }

  function successPanel() {
    return `<div class="result-mascot-art">${successSvg()}</div><div class="result-mascot-text"><strong>Conseguiu! A próxima ilha acendeu. 🐢💙</strong><span></span></div>`;
  }

  function failPanel() {
    return `<div class="result-mascot-art">${failSvg()}</div><div class="result-mascot-text"><strong>Respira. Vai dar certo na próxima. 🐢💙</strong><span></span></div>`;
  }

  function mapMascotSvg() {
    return `
    <svg class="mascot-svg" viewBox="0 0 112 118" role="img" aria-label="Estudante PRENAT+ e tartaruga">
      <defs>
        <linearGradient id="shirtMapV27" x1="0" x2="1"><stop offset="0" stop-color="#10ADB0"/><stop offset="1" stop-color="#055274"/></linearGradient>
        <linearGradient id="shellMapV27" x1="0" x2="1"><stop offset="0" stop-color="#A8DD78"/><stop offset="1" stop-color="#2D9A4F"/></linearGradient>
      </defs>
      <ellipse cx="54" cy="108" rx="38" ry="8" fill="rgba(5,82,116,.14)"/>
      <g class="mascot-student">
        <g class="mascot-leg-left"><path d="M38 79 C34 90 30 98 25 106" stroke="#07374F" stroke-width="7" stroke-linecap="round" fill="none"/><path d="M24 106 L36 108" stroke="#07374F" stroke-width="5" stroke-linecap="round"/></g>
        <g class="mascot-leg-right"><path d="M52 79 C58 91 63 98 70 105" stroke="#07374F" stroke-width="7" stroke-linecap="round" fill="none"/><path d="M70 106 L81 105" stroke="#07374F" stroke-width="5" stroke-linecap="round"/></g>
        <path d="M31 53 C38 43 58 43 65 53 L61 80 C54 86 41 86 34 80 Z" fill="url(#shirtMapV27)"/>
        <path d="M32 57 C25 62 22 70 20 77" stroke="#F0A978" stroke-width="6" stroke-linecap="round" fill="none"/>
        <path d="M63 58 C70 63 74 70 77 76" stroke="#F0A978" stroke-width="6" stroke-linecap="round" fill="none"/>
        <g class="mascot-head">
          <circle cx="48" cy="33" r="17" fill="#F2B486"/>
          <path d="M32 27 C39 14 58 14 65 28 C55 23 43 22 32 27" fill="#382817"/>
          <circle cx="43" cy="34" r="2" fill="#19313D"/><circle cx="54" cy="34" r="2" fill="#19313D"/>
          <path d="M42 42 C48 47 55 46 59 41" stroke="#8F3C4B" stroke-width="2.4" stroke-linecap="round" fill="none"/>
          <path d="M27 19 L69 17 L52 7 L14 13 Z" fill="#102E45"/>
          <path d="M52 7 L73 19" stroke="#102E45" stroke-width="3.5" stroke-linecap="round"/><circle cx="75" cy="20" r="3" fill="#FCCC46"/>
        </g>
      </g>
      <g class="mascot-turtle">
        <ellipse cx="80" cy="88" rx="18" ry="12" fill="url(#shellMapV27)"/>
        <path d="M68 85 C75 94 87 95 94 86" stroke="#1E713A" stroke-width="2.4" fill="none" opacity=".48"/>
        <circle cx="101" cy="86" r="7" fill="#76C766"/><circle cx="103" cy="84" r="1.4" fill="#123"/>
        <path d="M105 89 C102 92 99 92 96 89" stroke="#1E713A" stroke-width="1.7" fill="none"/>
        <circle cx="68" cy="99" r="3.6" fill="#76C766"/><circle cx="88" cy="100" r="3.6" fill="#76C766"/>
      </g>
    </svg>`;
  }

  function successSvg() {
    return `
    <svg class="result-mascot-svg" viewBox="0 0 170 138" aria-hidden="true">
      <defs><linearGradient id="shirtS27" x1="0" x2="1"><stop offset="0" stop-color="#10ADB0"/><stop offset="1" stop-color="#055274"/></linearGradient><linearGradient id="shellS27" x1="0" x2="1"><stop offset="0" stop-color="#B0E27B"/><stop offset="1" stop-color="#2B9A50"/></linearGradient></defs>
      <g class="sparkle" fill="#FCCC46"><path d="M22 23 l4 9 9 4-9 4-4 9-4-9-9-4 9-4z"/><path d="M144 20 l3 7 7 3-7 3-3 7-3-7-7-3 7-3z"/><circle cx="144" cy="84" r="4"/></g>
      <ellipse cx="88" cy="127" rx="60" ry="8" fill="rgba(5,82,116,.13)"/>
      <g class="student-success">
        <path d="M55 82 C48 96 43 107 38 119" stroke="#07374F" stroke-width="8" stroke-linecap="round" fill="none"/><path d="M76 82 C84 96 93 106 104 116" stroke="#07374F" stroke-width="8" stroke-linecap="round" fill="none"/>
        <path d="M48 48 C38 38 31 28 26 19" stroke="#F0A978" stroke-width="7" stroke-linecap="round" fill="none"/><path d="M89 48 C100 38 110 28 118 18" stroke="#F0A978" stroke-width="7" stroke-linecap="round" fill="none"/>
        <path d="M49 50 C58 39 79 39 88 50 L84 82 C74 90 62 90 53 82 Z" fill="url(#shirtS26)"/>
        <circle cx="69" cy="29" r="18" fill="#F2B486"/><path d="M52 23 C60 10 79 10 86 23 C76 19 64 18 52 23" fill="#382817"/>
        <circle cx="63" cy="30" r="2" fill="#18313E"/><circle cx="75" cy="30" r="2" fill="#18313E"/><path d="M61 38 C68 45 77 43 82 36" stroke="#8F3C4B" stroke-width="3" stroke-linecap="round" fill="none"/>
        <path d="M47 15 L91 13 L72 4 L33 10 Z" fill="#102E45"/><circle cx="95" cy="16" r="3" fill="#FCCC46"/>
      </g>
      <g class="turtle-success"><ellipse cx="122" cy="101" rx="22" ry="14" fill="url(#shellS26)"/><circle cx="147" cy="98" r="8" fill="#78C766"/><circle cx="150" cy="96" r="1.5" fill="#123"/><path d="M152 101 C149 105 144 105 141 101" stroke="#1E713A" stroke-width="2" fill="none"/><circle cx="106" cy="113" r="4" fill="#78C766"/><circle cx="129" cy="114" r="4" fill="#78C766"/></g>
    </svg>`;
  }

  function failSvg() {
    return `
    <svg class="result-mascot-svg" viewBox="0 0 170 138" aria-hidden="true">
      <defs><linearGradient id="shirtF27" x1="0" x2="1"><stop offset="0" stop-color="#10ADB0"/><stop offset="1" stop-color="#055274"/></linearGradient><linearGradient id="shellF27" x1="0" x2="1"><stop offset="0" stop-color="#A7DB79"/><stop offset="1" stop-color="#2B9650"/></linearGradient></defs>
      <ellipse cx="88" cy="125" rx="62" ry="8" fill="rgba(5,82,116,.12)"/>
      <g class="student-fail">
        <path d="M48 86 C39 94 32 104 27 115" stroke="#07374F" stroke-width="8" stroke-linecap="round" fill="none"/><path d="M72 88 C84 96 95 104 107 113" stroke="#07374F" stroke-width="8" stroke-linecap="round" fill="none"/>
        <path d="M43 55 C51 45 72 45 81 56 L78 87 C69 94 55 94 46 87 Z" fill="url(#shirtF26)"/>
        <path d="M49 60 C42 66 38 73 35 82" stroke="#F0A978" stroke-width="7" stroke-linecap="round" fill="none"/>
        <path class="pet-hand" d="M79 61 C89 68 97 76 105 85" stroke="#F0A978" stroke-width="7" stroke-linecap="round" fill="none"/>
        <circle cx="63" cy="36" r="18" fill="#F2B486"/><path d="M47 30 C54 18 73 18 80 31 C69 26 58 25 47 30" fill="#382817"/>
        <circle cx="57" cy="37" r="2" fill="#18313E"/><circle cx="69" cy="37" r="2" fill="#18313E"/><path d="M57 48 C63 45 70 45 76 48" stroke="#8F3C4B" stroke-width="3" stroke-linecap="round" fill="none"/>
        <path d="M42 22 L86 20 L68 10 L29 15 Z" fill="#102E45"/><circle cx="92" cy="22" r="3" fill="#FCCC46"/>
      </g>
      <g class="turtle-fail"><ellipse cx="118" cy="99" rx="24" ry="16" fill="url(#shellF26)"/><circle cx="143" cy="96" r="9" fill="#78C766"/><circle cx="146" cy="94" r="1.5" fill="#123"/><path d="M148 100 C145 103 140 103 137 100" stroke="#1E713A" stroke-width="2" fill="none"/><circle cx="101" cy="114" r="4" fill="#78C766"/><circle cx="129" cy="114" r="4" fill="#78C766"/><path d="M94 100 C87 99 84 94 88 91 C93 90 97 94 100 98" fill="#78C766"/></g>
      <path d="M25 45 C19 40 19 34 26 30" stroke="#D01890" stroke-width="3" fill="none" opacity=".28"/>
    </svg>`;
  }
})();
