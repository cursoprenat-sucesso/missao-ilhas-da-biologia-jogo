(() => {
  const app = document.getElementById('app');
  const letters = ['A', 'B', 'C', 'D', 'E'];
  let settings = null;
  let phaseQuestionCounts = {};
  let progress = null;
  let currentRun = null;

  const PRENAT_API_URL = 'https://script.google.com/macros/s/AKfycbz8ep4_hFtI2Ega27IKg-H5_rFBiNHPdt7Z-fk8hx4XIgrYtmxgpf2J1SBbbVShhDfL8A/exec';
  const GAME_API_URL = String(window.PRENAT_RUNTIME_CONFIG?.gameApiUrl || '');
  const GAME_CODE = String(window.PRENAT_RUNTIME_CONFIG?.gameCode || 'BIOLOGIA').toUpperCase();
  const STUDENT_KEY = 'prenat_student_identity_biologia_v1';
  const GAME_CONFIG_CACHE_KEY = 'prenat_biologia_game_config_v1';
  const GAME_NAME = 'Missão Ilhas da Biologia';
  const GAME_DISCIPLINE = 'Biologia';
  const DEFAULT_PHASE_COUNTS = Object.freeze({
    1: 120, 2: 151, 3: 80, 4: 40, 5: 107, 6: 110, 7: 76, 8: 165, 9: 144
  });
  let student = loadStudent();

  const FONT_STACKS = {
    inter: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    arial: 'Arial, Helvetica, sans-serif',
    trebuchet: '"Trebuchet MS", "Segoe UI", sans-serif',
    verdana: 'Verdana, Geneva, sans-serif',
    georgia: 'Georgia, "Times New Roman", serif',
    times: '"Times New Roman", Times, serif',
    palatino: '"Palatino Linotype", Palatino, Georgia, serif'
  };

  const DEFAULT_SETTINGS = {
    slug: 'missao-ilhas-da-biologia-prenat-v4',
    brand: 'PRENAT+',
    missionName: 'Missão Ilhas da Biologia',
    missionKicker: 'CAMPO DE TREINO PRENAT+',
    subtitle: 'Uma aventura em oceano aberto pelos grandes territórios da Biologia.',
    intro: 'A tartaruga PRENAT+ atravessa um arquipélago vivo, do mundo celular aos ecossistemas e ao Boss Final.',
    studentThemeNote: 'Cada rodada sorteia perguntas do banco da ilha. Você pode colocar muitas questões no professor; o jogo seleciona apenas a quantidade configurada para aquela fase.',
    showMetaToStudent: false,
    logo: 'logo-prenat.png',
    fontBodyKey: 'inter',
    fontHeadingKey: 'inter',
    starsMax: 5,
    starThresholds: [60, 65, 70, 75, 80],
    xpPerCorrect: 10,
    xpPerStar: 60,
    xpCompletionBonus: 100,
    coinPerStar: 4,
    coinCompletionBonus: 10,
    turtleRewards: [],
    ranks: [],
    phases: []
  };

  document.getElementById('changeStudent')?.addEventListener('click', () => {
    if (confirm('Deseja sair deste aluno e identificar outro estudante neste dispositivo?')) {
      localStorage.removeItem(STUDENT_KEY);
      window.location.reload();
    }
  });

  document.getElementById('openRanking')?.addEventListener('click', openRanking);

  document.getElementById('resetProgress')?.addEventListener('click', () => {
    if (!settings) return;
    if (confirm('Deseja recomeçar esta missão? XP, moedas, estrelas e ilhas salvas neste navegador serão apagados.')) {
      localStorage.removeItem(stateKey());
      progress = createInitialProgress();
      currentRun = null;
      saveProgress();
      renderHome();
    }
  });

  init();

  async function init() {
    try {
      settings = await fetchJson('settings.json', DEFAULT_SETTINGS);
      const gameConfig = await loadGameConfig();
      if (gameConfig.settings) settings = { ...settings, ...gameConfig.settings };
      phaseQuestionCounts = gameConfig.phaseCounts || {};
      normalizeData();
      progress = loadProgress();
      applyBrand();
      if (student) {
        updateStudentIdentity();
        sendAccess();
        renderHome();
      } else {
        renderStudentRegistration();
      }
    } catch (error) {
      console.error(error);
      app.innerHTML = `<section class="result-card glass-card"><div class="result-icon">⚠️</div><h1>Não foi possível concluir o carregamento</h1><p>Verifique a conexão e tente novamente. Nenhum progresso foi perdido.</p><button class="btn btn-primary" data-action="retry-load">Tentar carregar novamente</button></section>`;
      app.querySelector('[data-action="retry-load"]')?.addEventListener('click', init);
    }
  }

  async function loadGameConfig() {
    try {
      const config = await callGameApi({ action: 'config' }, { attempts: 3 });
      try {
        localStorage.setItem(GAME_CONFIG_CACHE_KEY, JSON.stringify({
          phaseCounts: config.phaseCounts || {},
          settings: config.settings || null,
          savedAt: new Date().toISOString()
        }));
      } catch (error) {
        console.warn('Não foi possível atualizar o cache seguro de configuração.', error);
      }
      return config;
    } catch (error) {
      console.warn('Supabase temporariamente indisponível; usando a última configuração segura.', error);
      try {
        const cached = JSON.parse(localStorage.getItem(GAME_CONFIG_CACHE_KEY) || 'null');
        if (cached?.phaseCounts && typeof cached.phaseCounts === 'object') return cached;
      } catch (cacheError) {
        console.warn('Cache de configuração inválido.', cacheError);
      }
      return { ok: true, phaseCounts: { ...DEFAULT_PHASE_COUNTS }, settings: null, fallback: true };
    }
  }

  async function callGameApi(payload, options = {}) {
    if (!GAME_API_URL) throw new Error('A API segura do jogo não foi configurada.');
    const attempts = Math.max(1, Math.min(3, Number(options.attempts || 1)));
    let lastError = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch(GAME_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, gameCode: GAME_CODE }),
          cache: 'no-store',
          signal: controller.signal
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result.ok === false) {
          const error = new Error(result.error || 'Falha ao acessar o banco de questões.');
          error.status = response.status;
          throw error;
        }
        return result;
      } catch (error) {
        lastError = error;
        const retryable = error?.name === 'AbortError' || !error?.status || Number(error.status) >= 500;
        if (!retryable || attempt >= attempts) break;
        await new Promise(resolve => window.setTimeout(resolve, attempt * 450));
      } finally {
        window.clearTimeout(timeout);
      }
    }
    throw lastError || new Error('Falha ao acessar o banco de questões.');
  }


  function loadStudent() {
    try {
      const saved = JSON.parse(localStorage.getItem(STUDENT_KEY) || 'null');
      return saved && saved.idAluno && saved.nome && saved.email && saved.turma && saved.apelido ? saved : null;
    } catch (error) {
      return null;
    }
  }

  function createStudentId() {
    const random = (crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`)
      .replace(/[^a-z0-9]/gi, '')
      .slice(0, 12)
      .toUpperCase();
    return `PRENAT-${random}`;
  }

  function renderStudentRegistration() {
    const template = document.getElementById('studentRegistrationTemplate').content.cloneNode(true);
    app.innerHTML = '';
    app.appendChild(template);
    document.getElementById('studentIdentity').textContent = '';

    const form = app.querySelector('#studentRegistrationForm');
    const errorBox = form.querySelector('[data-registration-error]');

    form.addEventListener('submit', event => {
      event.preventDefault();
      const data = new FormData(form);
      const nome = String(data.get('nome') || '').trim().replace(/\s+/g, ' ');
      const email = String(data.get('email') || '').trim().toLowerCase();
      const apelido = String(data.get('apelido') || '').trim().replace(/\s+/g, ' ');
      const turma = String(data.get('turma') || '').trim();

      if (nome.length < 5) {
        errorBox.textContent = 'Digite seu nome completo para registrar sua evolução.';
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errorBox.textContent = 'Digite um e-mail válido.';
        return;
      }
      if (apelido.length < 3) {
        errorBox.textContent = 'Digite um apelido com pelo menos 3 caracteres.';
        return;
      }
      if (/@|https?:|www\.|\d{8,}/i.test(apelido)) {
        errorBox.textContent = 'Não use e-mail, telefone ou link no apelido.';
        return;
      }

      student = { idAluno: createStudentId(), nome, email, turma, apelido };
      localStorage.setItem(STUDENT_KEY, JSON.stringify(student));
      sendToPrenat({ acao: 'cadastrar_aluno', ...student });
      // Reinicia pelo mesmo fluxo estável usado quando o aluno retorna ao jogo.
      // Evita que o mapa seja montado no meio da troca entre cadastro e missão.
      window.location.reload();
    });
  }

  function updateStudentIdentity() {
    const identity = document.getElementById('studentIdentity');
    if (identity && student) identity.textContent = `${student.apelido || student.nome} · ${student.turma}`;
  }

  function jsonp(params) {
    return new Promise((resolve, reject) => {
      const callback = `prenatRanking_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const script = document.createElement('script');
      const timeout = setTimeout(() => finish(new Error('Tempo de consulta esgotado.')), 12000);
      function finish(error, data) {
        clearTimeout(timeout);
        delete window[callback];
        script.remove();
        error ? reject(error) : resolve(data);
      }
      window[callback] = data => finish(null, data);
      script.onerror = () => finish(new Error('Não foi possível consultar o ranking.'));
      const query = new URLSearchParams({ ...params, callback });
      script.src = `${PRENAT_API_URL}?${query.toString()}`;
      document.head.appendChild(script);
    });
  }

  async function openRanking() {
    const template = document.getElementById('rankingTemplate').content.cloneNode(true);
    document.body.appendChild(template);
    const overlay = document.querySelector('.ranking-overlay');
    const content = overlay.querySelector('.ranking-content');
    const close = () => overlay.remove();
    overlay.querySelector('.ranking-close').addEventListener('click', close);
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });

    try {
      const data = await callGameApi({ action: 'ranking', studentId: student?.idAluno || '' }, { attempts: 2 });
      if (!data?.sucesso) throw new Error(data?.mensagem || 'Ranking indisponível.');
      renderPublicRanking(content, data);
    } catch (error) {
      content.innerHTML = `<p class="ranking-error">${escapeHtml(error.message)}</p>`;
    }
  }

  function renderPublicRanking(container, data) {
    const rows = Array.isArray(data.top10) ? data.top10 : [];
    const podiumMeta = [
      { medal:'🥇', title:'Tartaruga Catalisadora' },
      { medal:'🥈', title:'Tartaruga Navegadora' },
      { medal:'🥉', title:'Tartaruga Guardiã' }
    ];
    const podium = podiumMeta.map((meta, index) => {
      const item = rows[index];
      return `<div class="podium-card podium-${index + 1}"><span class="podium-medal">${meta.medal}</span><span class="podium-turtle">🐢</span><strong>${item ? escapeHtml(item.apelido) : 'Vaga aberta'}</strong><small>${meta.title}</small><b>${item ? `${Number(item.estrelas) || 0} ⭐` : '—'}</b></div>`;
    }).join('');
    const list = rows.map(item => `<div class="ranking-row"><span>${Number(item.posicao) || '—'}º</span><strong>${escapeHtml(item.apelido)}</strong><b>${Number(item.estrelas) || 0} ⭐</b></div>`).join('');
    const mine = data.minhaPosicao ? `<div class="my-ranking">🌊 Sua posição: <strong>${Number(data.minhaPosicao.posicao)}º — ${escapeHtml(data.minhaPosicao.apelido)}</strong> · ${Number(data.minhaPosicao.estrelas) || 0} ⭐</div>` : '';
    container.innerHTML = `<div class="podium-grid">${podium}</div>${mine}<div class="ranking-list">${list || '<p>Ainda não há navegadores classificados.</p>'}</div>`;
  }

  function detectDevice() {
    const agent = navigator.userAgent || '';
    if (/Android|iPhone|iPad|Mobile/i.test(agent)) return 'Celular ou tablet';
    return 'Computador';
  }

  function sendAccess() {
    if (!student) return;
    sendToPrenat({
      acao: 'registrar_acesso',
      ...student,
      jogo: GAME_NAME,
      disciplina: GAME_DISCIPLINE,
      tipoAcesso: 'Entrada no jogo',
      dispositivo: detectDevice()
    });
  }

  function nextAttemptNumber(phaseId) {
    const key = `${STUDENT_KEY}_attempt_${student?.idAluno || 'guest'}_${phaseId}`;
    const attempt = Number(localStorage.getItem(key) || 0) + 1;
    localStorage.setItem(key, String(attempt));
    return attempt;
  }

  function sendProgress(run, percent, passed) {
    if (!student) return;
    const stars = passed ? calculateStars(percent, run.phase.minPercent) : 0;
    const erros = Math.max(run.questions.length - run.score, 0);
    const attempt = nextAttemptNumber(run.phase.id);
    const status = passed ? 'Concluída' : 'Não concluída';
    const payload = {
      acao: 'registrar_progresso',
      tipoRegistro: 'Rodada finalizada',
      ...student,
      jogo: GAME_NAME,
      codigoJogo: GAME_CODE,
      disciplina: GAME_DISCIPLINE,
      ilha: run.phase.name || run.phase.title,
      missao: run.phase.title || `Fase ${run.phase.id}`,
      fase: run.phase.id,
      quantidadeQuestoes: run.questions.length,
      totalQuestoes: run.questions.length,
      quantidadeAcertos: run.score,
      acertos: run.score,
      quantidadeErros: erros,
      erros,
      percentualAcertos: percent,
      percentual: percent,
      porcentagemAcertos: percent,
      estrelas: stars,
      pontuacao: run.score * 100,
      tempoRealizacao: formatDuration(Date.now() - run.startedAt),
      situacao: status,
      status,
      aprovado: passed ? 'Sim' : 'Não',
      numeroTentativa: attempt,
      tentativa: attempt,
      dataHoraCliente: new Date().toISOString()
    };
    sendToPrenat(payload, true);
  }

  function formatDuration(milliseconds) {
    const seconds = Math.max(0, Math.round(milliseconds / 1000));
    const minutes = Math.floor(seconds / 60);
    return `${minutes}min ${seconds % 60}s`;
  }

  function sendToPrenat(payload, preferBeacon = false) {
    const enriched = {
      ...payload,
      idRegistroLocal: `${payload.acao || 'registro'}_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      paginaOrigem: location.href,
      userAgent: navigator.userAgent || '',
      enviadoEm: new Date().toISOString()
    };
    const body = JSON.stringify(enriched);

    try {
      const auditKey = 'prenat_biologia_registros_locais_v27';
      const audit = JSON.parse(localStorage.getItem(auditKey) || '[]');
      audit.push(enriched);
      localStorage.setItem(auditKey, JSON.stringify(audit.slice(-80)));
    } catch (_) {}

    if (preferBeacon && navigator.sendBeacon) {
      try {
        const blob = new Blob([body], { type: 'text/plain;charset=UTF-8' });
        if (navigator.sendBeacon(PRENAT_API_URL, blob)) return;
      } catch (_) {}
    }

    fetch(PRENAT_API_URL, {
      method: 'POST',
      mode: 'no-cors',
      cache: 'no-store',
      keepalive: true,
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body
    }).catch(error => console.warn('Registro PRENAT+ pendente:', error));
  }

  async function fetchJson(url, fallback) {
    try {
      const response = await fetch(`${url}?v=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Falha ao buscar ${url}`);
      return await response.json();
    } catch (error) {
      console.warn(`Usando fallback para ${url}`, error);
      return structuredClone ? structuredClone(fallback) : JSON.parse(JSON.stringify(fallback));
    }
  }

  
  function extractQuestionArrayStudentSafe(data) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.questions)) return data.questions;
    if (data && typeof data === 'object') {
      const numeric = Object.keys(data)
        .filter(k => /^\d+$/.test(k))
        .sort((a,b) => Number(a) - Number(b))
        .map(k => data[k])
        .filter(q => q && typeof q === 'object' && (q.statement || q.text || Array.isArray(q.options)));
      if (numeric.length) return numeric;
    }
    return [];
  }

function normalizeData() {
    settings = { ...DEFAULT_SETTINGS, ...settings };
    settings.starsMax = Number(settings.starsMax || 5);
    settings.starThresholds = Array.isArray(settings.starThresholds) && settings.starThresholds.length
      ? settings.starThresholds.map(Number)
      : [settings.phases?.[0]?.minPercent || 60, 70, 80, 85, 90];
    settings.turtleRewards = Array.isArray(settings.turtleRewards) ? settings.turtleRewards.map((item, index) => ({
      phaseId: Number(item.phaseId || index + 1),
      name: item.name || `Item de evolução ${index + 1}`,
      icon: item.icon || '🐢',
      message: item.message || 'Você ganhou um novo item de evolução para a tartaruga PRENAT+.'
    })) : [];
    settings.ranks = Array.isArray(settings.ranks) ? settings.ranks.map((rank, index) => ({
      name: rank.name || `Patente ${index}`,
      icon: rank.icon || '🐢',
      visualStage: Number(rank.visualStage ?? index),
      description: rank.description || ''
    })) : [];
    settings.phases = Array.isArray(settings.phases) ? settings.phases.map((phase, index) => ({
      id: Number(phase.id || index + 1),
      name: phase.name || `Ilha ${index + 1}`,
      title: phase.title || `Fase ${index + 1}`,
      story: phase.story || 'Vença as questões para desbloquear a próxima etapa.',
      minPercent: Number(phase.minPercent || 60),
      lives: Number(phase.lives || 3),
      questionLimit: Number(phase.questionLimit || 0),
      shuffle: phase.shuffle !== false,
      rewardRankIndex: Number(phase.rewardRankIndex ?? Math.min(index + 1, Math.max(0, settings.ranks.length - 1))),
      rewardItemIndex: Number(phase.rewardItemIndex ?? index),
      difficultyLabel: phase.difficultyLabel || 'Treino',
      iconStage: Number(phase.iconStage ?? index),
      icon: phase.icon || islandIcon(index),
      cumulative: Boolean(phase.cumulative),
      x: clamp(Number(phase.x ?? mapX(index)), 4, 92),
      y: clamp(Number(phase.y ?? mapY(index)), 8, 92)
    })) : [];
  }

  function normalizeQuestion(q, index) {
    const fallbackPositive = q.feedbackPositive || q.positiveFeedback || q.feedback_pos || q.explanation || '';
    const fallbackNegative = q.feedbackNegative || q.negativeFeedback || q.feedback_neg || q.explanation || '';
    let options = [];
    if (Array.isArray(q.options)) {
      options = q.options.map((op, i) => typeof op === 'string'
        ? { text: op, correct: Number(q.correctIndex) === i, feedback: '' }
        : { text: op.text || '', correct: Boolean(op.correct), feedback: '' });
    }
    if (!options.some(op => op.correct) && Number.isInteger(q.correctIndex) && options[q.correctIndex]) options[q.correctIndex].correct = true;
    return {
      id: q.id || `q_${index + 1}`,
      phase: Number(q.phase || 1),
      discipline: q.discipline || '',
      topic: q.topic || '',
      difficulty: q.difficulty || '',
      statement: q.statement || q.text || '',
      image: q.image || '',
      options,
      feedbackPositive: fallbackPositive,
      feedbackNegative: fallbackNegative,
      explanation: q.explanation || fallbackPositive || fallbackNegative || '',
      metadata: q.metadata || {}
    };
  }

  function applyBrand() {
    document.title = `${settings.brand} | ${settings.missionName}`;
    const brandName = document.getElementById('brandName');
    const missionMini = document.getElementById('missionMini');
    const brandLogo = document.getElementById('brandLogo');
    if (brandName) brandName.textContent = settings.brand;
    if (missionMini) missionMini.textContent = settings.missionName;
    if (brandLogo && settings.logo) brandLogo.src = settings.logo;
    document.querySelectorAll('.mission-logo-img').forEach(img => { if (settings.logo) img.src = settings.logo; });
    const bodyFont = FONT_STACKS[settings.fontBodyKey] || FONT_STACKS.inter;
    const headingFont = FONT_STACKS[settings.fontHeadingKey] || bodyFont;
    document.documentElement.style.setProperty('--student-body-font', bodyFont);
    document.documentElement.style.setProperty('--student-heading-font', headingFont);
  }

  function stateKey() {
    return `prenat_biologia_progress_${settings.slug || settings.missionName || 'missao'}_${student?.idAluno || 'guest'}`;
  }

  function createInitialProgress() { return { unlockedPhase: 1, completedPhases: [], rankIndex: 0, phaseScores: {}, rewardItems: [], xp: 0, coins: 0, questionCycles: {} }; }
  function normalizeProgress(raw) {
    const base = createInitialProgress();
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const phaseIds = new Set((settings?.phases || []).map(phase => Number(phase.id)).filter(Number.isFinite));
    const maxPhase = Math.max(1, ...phaseIds);
    const completedPhases = Array.isArray(source.completedPhases)
      ? [...new Set(source.completedPhases.map(Number).filter(id => phaseIds.has(id)))].sort((a, b) => a - b)
      : [];
    const minimumUnlocked = completedPhases.length ? Math.min(maxPhase, Math.max(...completedPhases) + 1) : 1;
    const savedUnlocked = Number(source.unlockedPhase);
    const unlockedPhase = Math.max(minimumUnlocked, Math.min(maxPhase, Number.isFinite(savedUnlocked) ? savedUnlocked : 1));
    const phaseScores = source.phaseScores && typeof source.phaseScores === 'object' && !Array.isArray(source.phaseScores)
      ? source.phaseScores
      : {};
    const rewardItems = Array.isArray(source.rewardItems)
      ? [...new Set(source.rewardItems.map(Number).filter(Number.isFinite))]
      : [];
    const questionCycles = source.questionCycles && typeof source.questionCycles === 'object' && !Array.isArray(source.questionCycles)
      ? source.questionCycles
      : {};
    return {
      ...base,
      unlockedPhase,
      completedPhases,
      rankIndex: Math.max(0, Math.min((settings?.ranks?.length || 1) - 1, Number(source.rankIndex) || 0)),
      phaseScores,
      rewardItems,
      xp: Math.max(0, Number(source.xp) || 0),
      coins: Math.max(0, Number(source.coins) || 0),
      questionCycles
    };
  }
  function loadProgress() {
    try {
      const saved = localStorage.getItem(stateKey());
      return normalizeProgress(saved ? JSON.parse(saved) : null);
    } catch { return createInitialProgress(); }
  }
  function saveProgress() {
    try { localStorage.setItem(stateKey(), JSON.stringify(normalizeProgress(progress))); }
    catch (error) { console.warn('Não foi possível salvar o progresso neste navegador.', error); }
  }

  function renderHome() {
    const template = document.getElementById('homeTemplate').content.cloneNode(true);
    app.innerHTML = '';
    app.appendChild(template);
    bindText('[data-bind="missionKicker"]', settings.missionKicker);
    bindText('[data-bind="missionName"]', settings.missionName);
    bindText('[data-bind="subtitle"]', settings.subtitle);
    bindText('[data-bind="intro"]', settings.intro);
    bindText('[data-bind="studentThemeNote"]', settings.studentThemeNote || 'Avance no seu ritmo. Cada tentativa é treino real.');
    renderRankPanel();
    renderMap();
    app.querySelector('[data-action="continue"]')?.addEventListener('click', () => {
      const next = settings.phases.find(p => !progress.completedPhases.includes(p.id) && p.id <= progress.unlockedPhase) || settings.phases.find(p => p.id === progress.unlockedPhase) || settings.phases[0];
      if (next) startPhase(next.id);
    });
    app.querySelector('[data-action="view-map"]')?.addEventListener('click', () => document.getElementById('mapa')?.scrollIntoView({ behavior: 'smooth' }));
  }

  function bindText(selector, text) { const el = app.querySelector(selector); if (el) el.textContent = text ?? ''; }

  function renderRankPanel() {
    const rank = settings.ranks[Math.min(progress.rankIndex || 0, settings.ranks.length - 1)] || settings.ranks[0] || { name: 'Patente inicial', description: '' };
    const completedCount = progress.completedPhases.length;
    const total = settings.phases.length || 1;
    const percent = Math.round((completedCount / total) * 100);
    const nextPhase = settings.phases.find(p => !progress.completedPhases.includes(p.id));
    const nextRank = nextPhase ? settings.ranks[nextPhase.rewardRankIndex] : null;
    const maxStars = total * (settings.starsMax || 5);
    const starTotal = Object.values(progress.phaseScores || {}).reduce((sum, item) => sum + Number(item.stars || 0), 0);

    const rankIcon = app.querySelector('[data-rank-icon]');
    if (rankIcon) rankIcon.innerHTML = badgeSvg(rank.icon || '🐢', rank.visualStage || 0, 'rank');
    app.querySelector('[data-rank-name]').textContent = rank.name || 'Patente inicial';
    app.querySelector('[data-rank-description]').textContent = rank.description || '';
    app.querySelector('[data-xp-total]').textContent = String(progress.xp || 0);
    app.querySelector('[data-coin-total]').textContent = String(progress.coins || 0);
    app.querySelector('[data-star-total]').textContent = `${starTotal}/${maxStars}`;
    app.querySelector('[data-progress-text]').textContent = `${percent}%`;
    app.querySelector('[data-progress-caption]').textContent = nextRank
      ? `${completedCount} de ${total} ilhas concluídas · próxima patente: ${nextRank.name}`
      : `${completedCount} de ${total} ilhas concluídas · travessia da vida completa`;
    const circle = app.querySelector('[data-progress-circle]');
    if (circle) circle.style.strokeDashoffset = String(314 - (314 * percent / 100));
    renderEvolutionStrip();
  }

  function renderEvolutionStrip() {
    const strip = app.querySelector('[data-evolution-strip]');
    if (!strip) return;
    const earnedIds = new Set(progress.rewardItems || []);
    const preview = settings.turtleRewards.slice(0, 6).map(item => {
      const earned = earnedIds.has(item.phaseId);
      return `<span class="evolution-token ${earned ? 'earned' : ''}" title="${escapeHtml(item.name)}">${earned ? escapeHtml(item.icon) : '🔒'}</span>`;
    }).join('');
    const totalEarned = earnedIds.size;
    strip.innerHTML = `<span class="evolution-label">Evolução da tartaruga</span><div>${preview}</div><small>${totalEarned}/${settings.turtleRewards.length || settings.phases.length} itens</small>`;
  }

  function renderMap() {
    const map = app.querySelector('[data-island-map]');
    const story = app.querySelector('[data-map-story]');
    if (story) story.textContent = 'A tartaruga PRENAT+ atravessa o arquipélago da vida: cada ilha vencida acende o caminho e libera a próxima etapa.';
    if (!map) return;
    updateRouteGeometry();
    map.innerHTML = '';
    settings.phases.forEach((phase, index) => {
      try {
      const unlocked = phase.id <= progress.unlockedPhase;
      const completed = progress.completedPhases.includes(phase.id);
      const active = unlocked && !completed;
      const poolSize = getPhasePoolCount(phase);
      const playableCount = getPlayableCount(phase, poolSize);
      const score = progress.phaseScores?.[phase.id];
      const stars = score?.stars || 0;
      const reward = settings.turtleRewards?.[phase.rewardItemIndex] || settings.turtleRewards?.[index];
      const node = document.createElement('article');
      node.className = `map-node rpg-node ${unlocked ? 'unlocked' : 'locked'} ${completed ? 'completed' : ''} ${active ? 'current' : ''}`;
      node.style.left = `${phase.x}%`;
      node.style.top = `${phase.y}%`;
      node.style.setProperty('--x', `${phase.x}%`);
      node.style.setProperty('--y', `${phase.y}%`);
      node.dataset.phaseId = String(phase.id);
      node.innerHTML = `
        <button class="map-island-button" ${unlocked && poolSize ? '' : 'disabled'} data-start-phase="${phase.id}" aria-label="${escapeHtml(phase.name)}: ${escapeHtml(phase.title)}">
          <span class="island-status-bubble">${completed ? '✓' : active ? '!' : '🔒'}</span>
          <span class="node-badge">${index + 1}</span>
          <span class="floating-island" aria-hidden="true">
            <span class="island-shadow"></span>
            <span class="island-cliff"></span>
            <span class="island-top">
              <span class="island-grass"></span>
              <span class="island-sand"></span>
              <span class="tiny-tree tree-a"></span>
              <span class="tiny-tree tree-b"></span>
              <span class="chem-prop">${escapeHtml(phase.icon || islandIcon(index))}</span>
            </span>
          </span>
          <span class="node-caption">
            <small>${escapeHtml(phase.name)}</small>
            <strong>${escapeHtml(shortTitle(phase.title))}</strong>
          </span>
          <span class="node-stars" aria-label="${stars} de ${settings.starsMax || 5} estrelas">${starHtml(stars)}</span>
        </button>
        <div class="island-info-panel">
          <strong>${escapeHtml(phase.title)}</strong>
          <p>${escapeHtml(phase.story)}</p>
          <div class="island-info-meta">
            <span>Meta ${phase.minPercent}%</span>
            <span>${phase.lives} vidas</span>
            <span>${playableCount || phase.questionLimit || 'todas'} questões</span>
          </div>
          <em>${completed ? 'Ilha conquistada. Você pode refazer para melhorar estrelas.' : unlocked ? `Recompensa: ${escapeHtml(reward?.name || 'item da tartaruga')}` : 'Bloqueada: vença a ilha anterior para abrir este caminho.'}</em>
        </div>`;
        map.appendChild(node);
      } catch (error) {
        console.error(`Não foi possível montar a ilha ${phase?.id || index + 1}.`, error);
        const fallback = document.createElement('article');
        fallback.className = 'map-node rpg-node locked map-node-fallback';
        fallback.style.left = `${Number(phase?.x) || 50}%`;
        fallback.style.top = `${Number(phase?.y) || 50}%`;
        fallback.style.setProperty('--x', `${Number(phase?.x) || 50}%`);
        fallback.style.setProperty('--y', `${Number(phase?.y) || 50}%`);
        fallback.innerHTML = `<button class="map-island-button" disabled><span class="node-badge">${index + 1}</span><span class="node-caption"><small>Ilha ${index + 1}</small><strong>Carregando dados…</strong></span></button>`;
        map.appendChild(fallback);
      }
    });
    if (!map.children.length && settings.phases.length) {
      map.innerHTML = '<p class="map-load-warning">As ilhas não terminaram de carregar. Atualize esta página para continuar.</p>';
    }
    map.querySelectorAll('[data-start-phase]').forEach(btn => btn.addEventListener('click', () => startPhase(Number(btn.dataset.startPhase))));
    updateRouteProgress();
  }

  function shortTitle(title) {
    const text = String(title || '');
    if (text.length <= 34) return text;
    return text.replace(' e ', ' + ').slice(0, 32).trim() + '…';
  }

  function updateRouteGeometry() {
    const ordered = [...(settings.phases || [])].sort((a, b) => Number(a.id) - Number(b.id));
    if (!ordered.length) return;
    const points = ordered.map(p => ({ x: Number(p.x || 50), y: Number(p.y || 50) }));
    const d = buildIslandRoutePath(points);
    app.querySelectorAll('.route-shadow,.route-main,.route-done').forEach(path => path.setAttribute('d', d));
  }

  function buildIslandRoutePath(points) {
    if (!points.length) return '';
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
    const parts = [`M ${points[0].x} ${points[0].y}`];
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const cur = points[i];
      const dx = cur.x - prev.x;
      const dy = cur.y - prev.y;
      const curve = Math.min(7, Math.max(2, Math.hypot(dx, dy) / 4));
      const c1x = prev.x + dx * 0.48;
      const c1y = prev.y + dy * 0.48 - curve;
      const c2x = prev.x + dx * 0.52;
      const c2y = prev.y + dy * 0.52 + curve;
      parts.push(`C ${round(c1x)} ${round(c1y)}, ${round(c2x)} ${round(c2y)}, ${cur.x} ${cur.y}`);
    }
    return parts.join(' ');
  }

  function round(n) { return Math.round(n * 10) / 10; }

  function updateRouteProgress() {
    const path = app.querySelector('.route-done');
    if (!path || typeof path.getTotalLength !== 'function') return;
    const totalPhases = Math.max(1, settings.phases.length - 1);
    // V9: a trilha pink representa ilhas efetivamente conquistadas.
    // A rota creme permanece inteira como caminho-base; o pink cresce por conquista.
    const completedSteps = Array.isArray(progress.completedPhases) ? progress.completedPhases.length : 0;
    const rawRatio = completedSteps / totalPhases;
    const ratio = Math.max(0.018, Math.min(1, rawRatio));
    requestAnimationFrame(() => {
      const length = path.getTotalLength();
      const offset = length * (1 - ratio);
      // V8: o CSS usa variáveis com !important para impedir que versões antigas
      // deixem a trilha rosa preenchida inteira. Assim, o caminho creme aparece
      // completo e apenas o trecho vencido recebe o pink PRENAT+.
      path.style.setProperty('--route-length', String(length));
      path.style.setProperty('--route-offset', String(offset));
      path.style.strokeDasharray = String(length);
      path.style.strokeDashoffset = String(offset);
    });
  }

  function getPhasePoolCount(phase) {
    if (!phase) return 0;
    if (!phase.cumulative) return Number(phaseQuestionCounts[String(phase.id)] || 0);
    return Object.entries(phaseQuestionCounts).reduce((total, [phaseId, count]) => (
      Number(phaseId) <= Number(phase.id) ? total + Number(count || 0) : total
    ), 0);
  }
  function getPlayableCount(phase, poolLength) {
    if (!poolLength) return 0;
    if (!phase.questionLimit || phase.questionLimit <= 0) return poolLength;
    return Math.min(phase.questionLimit, poolLength);
  }
  
  // ===== PRENAT+ BANCO ROTATIVO DE QUESTÕES =====
  // Regra C: o aluno só repete uma questão depois de esgotar todo o banco daquela ilha/ciclo.
  function getQuestionCycleId(q) {
    if (q?.id) return String(q.id);
    const base = `${q?.phase || ''}|${q?.statement || ''}|${Array.isArray(q?.options) ? q.options.map(op => op.text || '').join('|') : ''}`;
    let hash = 0;
    for (let i = 0; i < base.length; i++) {
      hash = ((hash << 5) - hash + base.charCodeAt(i)) | 0;
    }
    return `auto_${Math.abs(hash)}`;
  }

  function ensureQuestionCycles() {
    if (!progress.questionCycles || typeof progress.questionCycles !== 'object') progress.questionCycles = {};
    return progress.questionCycles;
  }

  function getQuestionCycleStore(phaseId) {
    const cycles = ensureQuestionCycles();
    const key = String(phaseId);
    const store = cycles[key] && typeof cycles[key] === 'object'
      ? cycles[key]
      : { used: [], cycle: 1, updatedAt: null };
    store.used = Array.isArray(store.used) ? Array.from(new Set(store.used.map(String))) : [];
    store.cycle = Math.max(1, Number(store.cycle || 1));
    cycles[key] = store;
    return store;
  }

  function syncCycleWithPool(phaseId, pool) {
    const store = getQuestionCycleStore(phaseId);
    const poolIds = new Set(pool.map(getQuestionCycleId));
    const before = store.used.length;
    store.used = store.used.filter(id => poolIds.has(id));
    if (before !== store.used.length) {
      store.updatedAt = new Date().toISOString();
      saveProgress();
    }
    return store;
  }

  function startNewQuestionCycle(phaseId) {
    const store = getQuestionCycleStore(phaseId);
    store.used = [];
    store.cycle = Math.max(1, Number(store.cycle || 1)) + 1;
    store.updatedAt = new Date().toISOString();
    saveProgress();
    return store;
  }

  function markQuestionAsSeenInCycle(run, q) {
    if (!run?.phase || !q) return;
    const store = getQuestionCycleStore(run.phase.id);
    const id = getQuestionCycleId(q);
    if (!store.used.includes(id)) {
      store.used.push(id);
      store.updatedAt = new Date().toISOString();
      saveProgress();
    }
  }

  function markSelectedQuestionsAsSeenInCycle(phase, selectedQuestions) {
    if (!phase || !Array.isArray(selectedQuestions) || !selectedQuestions.length) return;
    const store = getQuestionCycleStore(phase.id);
    let changed = false;
    selectedQuestions.forEach(q => {
      const id = getQuestionCycleId(q);
      if (!store.used.includes(id)) {
        store.used.push(id);
        changed = true;
      }
    });
    if (changed) {
      store.updatedAt = new Date().toISOString();
      saveProgress();
    }
  }
  // ===== FIM BANCO ROTATIVO =====

  function selectQuestionsForAttempt(phase, pool) {
    if (!pool.length) return [];

    const limit = getPlayableCount(phase, pool.length);
    let store = syncCycleWithPool(phase.id, pool);
    const poolIds = pool.map(getQuestionCycleId);

    if (store.used.length >= poolIds.length) {
      store = startNewQuestionCycle(phase.id);
      window.setTimeout(() => alert('Novo ciclo iniciado nesta ilha. Você já passou por todo o banco disponível; agora as questões podem aparecer novamente em nova ordem.'), 50);
    }

    const usedSet = new Set(store.used);
    let freshPool = pool.filter(q => !usedSet.has(getQuestionCycleId(q)));

    if (!freshPool.length) {
      store = startNewQuestionCycle(phase.id);
      freshPool = [...pool];
      window.setTimeout(() => alert('Novo ciclo iniciado nesta ilha. Você já passou por todo o banco disponível; agora as questões podem aparecer novamente em nova ordem.'), 50);
    }

    const freshBefore = freshPool.length;
    const shuffled = phase.shuffle ? shuffleArray(freshPool) : [...freshPool];
    const selected = shuffled.slice(0, Math.min(limit, shuffled.length));

    if (freshBefore < limit && freshBefore > 0) {
      window.setTimeout(() => alert(`Você está concluindo o ciclo desta ilha. Restavam apenas ${freshBefore} questão(ões) inédita(s). Depois desta rodada, um novo ciclo será iniciado.`), 50);
    }

    const output = selected.map(q => ({
      ...q,
      options: Array.isArray(q.options) ? [...q.options] : []
    }));
    output.__cycleInfo = {
      cycle: store.cycle,
      total: pool.length,
      remainingBefore: freshBefore,
      selectedCount: output.length,
      limit
    };
    return output;
  }

  async function startPhase(phaseId) {
    const phase = settings.phases.find(p => p.id === phaseId);
    if (!phase || phase.id > progress.unlockedPhase) return renderHome();
    const poolSize = getPhasePoolCount(phase);
    if (!poolSize) { alert('Esta ilha ainda não possui questões cadastradas.'); return renderHome(); }
    const store = getQuestionCycleStore(phase.id);
    try {
      const result = await callGameApi({
        action: 'start_attempt',
        phase: phase.id,
        limit: getPlayableCount(phase, poolSize),
        cumulative: Boolean(phase.cumulative),
        seenIds: store.used
      });
      if (result.cycleReset) {
        startNewQuestionCycle(phase.id);
        window.setTimeout(() => alert('Novo ciclo iniciado nesta ilha. Você já passou por todo o banco disponível; agora as questões podem aparecer novamente em nova ordem.'), 50);
      }
      const phaseQuestions = Array.isArray(result.questions) ? result.questions : [];
      if (!phaseQuestions.length) throw new Error('Nenhuma questão disponível nesta rodada.');
      markSelectedQuestionsAsSeenInCycle(phase, phaseQuestions);
      currentRun = {
        attemptId: result.attemptId,
        startedAt: Date.now(),
        phase,
        poolSize: Number(result.poolSize || poolSize),
        cycleInfo: {
          cycle: getQuestionCycleStore(phase.id).cycle,
          total: Number(result.poolSize || poolSize),
          remainingBefore: Number(result.remainingBefore || phaseQuestions.length)
        },
        questions: phaseQuestions,
        index: 0,
        lives: phase.lives,
        score: 0,
        answered: false
      };
      renderQuestion();
    } catch (error) {
      console.error(error);
      alert(error.message || 'Não foi possível iniciar esta ilha.');
      renderHome();
    }
  }

  function renderQuestion() {
    const run = currentRun;
    const q = run.questions[run.index];
    const template = document.getElementById('quizTemplate').content.cloneNode(true);
    app.innerHTML = '';
    app.appendChild(template);
    app.querySelector('[data-action="back-home"]')?.addEventListener('click', renderHome);
    app.querySelector('[data-phase-title]').textContent = run.phase.title;
    app.querySelector('[data-phase-story]').textContent = run.phase.story;
    app.querySelector('[data-lives]').textContent = '❤️'.repeat(run.lives) || '0';
    app.querySelector('[data-minpercent]').textContent = `${run.phase.minPercent}%`;
    app.querySelector('[data-score]').textContent = `${run.score}/${run.questions.length}`;
    const cycleText = run.cycleInfo ? ` · ciclo ${run.cycleInfo.cycle} · inéditas antes da rodada: ${run.cycleInfo.remainingBefore}/${run.cycleInfo.total}` : '';
    app.querySelector('[data-question-count]').textContent = `Questão ${run.index + 1} de ${run.questions.length} · banco rotativo${cycleText}`;
    app.querySelector('[data-quiz-progress]').style.width = `${(run.index / run.questions.length) * 100}%`;
    app.querySelector('[data-question-index]').textContent = `Questão ${run.index + 1}`;
    app.querySelector('[data-question-meta]').textContent = settings.showMetaToStudent
      ? [q.discipline, q.topic, q.difficulty].filter(Boolean).join(' · ')
      : 'Desafio de Biologia';
    app.querySelector('[data-question-statement]').innerHTML = q.statement;
    const imgWrap = app.querySelector('[data-question-image-wrap]');
    const img = app.querySelector('[data-question-image]');
    if (q.image) { img.src = q.image; imgWrap.classList.add('visible'); }
    const list = app.querySelector('[data-options-list]');
    q.options.forEach((op, i) => {
      const button = document.createElement('button');
      button.className = 'option-btn';
      button.innerHTML = `<span class="option-letter">${letters[i] || i + 1}</span><span>${op.text}</span>`;
      button.addEventListener('click', () => answerQuestion(i));
      list.appendChild(button);
    });
    typesetMath();
  }

  async function answerQuestion(selectedIndex) {
    const run = currentRun;
    if (run.answered) return;
    run.answered = true;
    const q = run.questions[run.index];
    app.querySelectorAll('.option-btn').forEach(btn => btn.classList.add('disabled'));
    let answer;
    try {
      answer = await callGameApi({
        action: 'submit_answer',
        attemptId: run.attemptId,
        questionId: q.questionId,
        selectedIndex
      }, { attempts: 2 });
    } catch (error) {
      console.error(error);
      run.answered = false;
      app.querySelectorAll('.option-btn').forEach(btn => btn.classList.remove('disabled'));
      alert(error.message || 'Não foi possível registrar a resposta.');
      return;
    }
    const correctIndex = Number(answer.correctIndex);
    const effectiveSelectedIndex = Number.isInteger(Number(answer.selectedIndex)) ? Number(answer.selectedIndex) : selectedIndex;
    const isCorrect = Boolean(answer.correct);
    q.feedbackPositive = answer.feedbackPositive || answer.explanation || '';
    q.feedbackNegative = answer.feedbackNegative || answer.explanation || '';
    q.explanation = answer.explanation || '';
    if (isCorrect) run.score += 1;
    else run.lives = Math.max(0, run.lives - 1);
    app.querySelector('[data-lives]').textContent = '❤️'.repeat(run.lives) || '0';
    app.querySelector('[data-score]').textContent = `${run.score}/${run.questions.length}`;
    app.querySelectorAll('.option-btn').forEach((btn, i) => {
      btn.classList.add('disabled');
      if (i === correctIndex) btn.classList.add('correct');
      if (i === effectiveSelectedIndex && !isCorrect) btn.classList.add('wrong');
    });
    const panel = app.querySelector('[data-feedback-panel]');
    panel.classList.remove('hidden');
    panel.classList.toggle('correct-feedback', isCorrect);
    panel.classList.toggle('wrong-feedback', !isCorrect);
    app.querySelector('[data-feedback-title]').textContent = isCorrect ? '🎉 Muito bem! A tartaruga avançou.' : (run.lives <= 0 ? '🐢 As vidas acabaram nesta rodada.' : '🐢 Você caiu em uma armadilha.');
    app.querySelector('[data-feedback-text]').innerHTML = buildFeedbackText(isCorrect, q);
    app.querySelector('[data-feedback-descriptor]').innerHTML = getQuestionFeedback(isCorrect, q);
    const nextButton = app.querySelector('[data-action="next-question"]');
    nextButton.textContent = run.lives <= 0 ? 'Ver resultado' : (run.index >= run.questions.length - 1 ? 'Concluir ilha' : 'Continuar travessia');
    nextButton.addEventListener('click', nextStep);
    typesetMath();
  }

  function getQuestionFeedback(isCorrect, q) {
    if (isCorrect) {
      return q.feedbackPositive || q.explanation || '🎉 Muito bem! Você acertou e avançou na travessia.';
    }
    return q.feedbackNegative || q.explanation || '🐢 Você caiu em uma armadilha. Revise o conceito e tente novamente.';
  }

  function buildFeedbackText(isCorrect, q) {
    if (isCorrect) {
      return '<strong>🎉 Acerto confirmado!</strong> A tartaruga PRENAT+ avançou mais uma etapa. Veja a explicação abaixo.';
    }
    return '<strong>🐢 Armadilha encontrada.</strong> Errar aqui também faz parte do treino. Veja a explicação abaixo para ajustar sua estratégia.';
  }

  function nextStep() {
    if (currentRun.lives <= 0 || currentRun.index >= currentRun.questions.length - 1) return finishPhase();
    currentRun.index += 1;
    currentRun.answered = false;
    renderQuestion();
  }

  function finishPhase() {
    const run = currentRun;
    const percent = Math.round((run.score / run.questions.length) * 100);
    const passed = run.lives > 0 && percent >= run.phase.minPercent;
    const stars = passed ? calculateStars(percent, run.phase.minPercent) : 0;
    const earned = calculateRewards(run.score, stars, passed);
    const previousRank = settings.ranks[progress.rankIndex] || settings.ranks[0] || { name: 'Patente inicial' };
    const nextRank = settings.ranks[run.phase.rewardRankIndex] || previousRank;
    const previousBest = progress.phaseScores?.[run.phase.id] || { xpAwarded: 0, coinAwarded: 0, stars: 0, percent: 0 };

    if (passed) {
      if (!progress.completedPhases.includes(run.phase.id)) progress.completedPhases.push(run.phase.id);
      progress.unlockedPhase = Math.max(progress.unlockedPhase, run.phase.id + 1);
      progress.rankIndex = Math.max(progress.rankIndex, run.phase.rewardRankIndex || 0);
      const reward = getRewardForPhase(run.phase);
      if (reward && !progress.rewardItems.includes(reward.phaseId)) progress.rewardItems.push(reward.phaseId);
      const xpDelta = Math.max(0, earned.xp - Number(previousBest.xpAwarded || 0));
      const coinDelta = Math.max(0, earned.coins - Number(previousBest.coinAwarded || 0));
      progress.xp = Number(progress.xp || 0) + xpDelta;
      progress.coins = Number(progress.coins || 0) + coinDelta;
      if (stars >= Number(previousBest.stars || 0) || percent >= Number(previousBest.percent || 0)) {
        progress.phaseScores[run.phase.id] = { score: run.score, total: run.questions.length, percent, stars, date: new Date().toISOString(), poolSize: run.poolSize, xpAwarded: Math.max(earned.xp, previousBest.xpAwarded || 0), coinAwarded: Math.max(earned.coins, previousBest.coinAwarded || 0) };
      }
      saveProgress();
    }
    sendProgress(run, percent, passed);
    renderResult({ passed, percent, previousRank, nextRank, run, stars, earned });
  }

  function calculateStars(percent, minPercent) {
    const configured = Array.isArray(settings.starThresholds) && settings.starThresholds.length
      ? settings.starThresholds
      : [minPercent, 65, 70, 75, 80];
    const thresholds = configured.map(Number).filter(Number.isFinite).sort((a, b) => a - b).slice(0, settings.starsMax || 5);
    const count = thresholds.filter(t => percent >= t).length;
    return Math.max(1, Math.min(settings.starsMax || 5, count));
  }
  function calculateRewards(score, stars, passed) {
    const xp = Number(score || 0) * Number(settings.xpPerCorrect || 10) + Number(stars || 0) * Number(settings.xpPerStar || 60) + (passed ? Number(settings.xpCompletionBonus || 100) : 0);
    const coins = Number(stars || 0) * Number(settings.coinPerStar || 4) + (passed ? Number(settings.coinCompletionBonus || 10) : 0);
    return { xp, coins };
  }

  function renderResult({ passed, percent, previousRank, nextRank, run, stars, earned }) {
    const reward = getRewardForPhase(run.phase);
    const template = document.getElementById('resultTemplate').content.cloneNode(true);
    app.innerHTML = '';
    app.appendChild(template);
    const resultIcon = app.querySelector('[data-result-icon]');
    if (resultIcon) resultIcon.innerHTML = badgeSvg(passed ? (nextRank.icon || '🐢') : (previousRank.icon || '🐢'), passed ? (nextRank.visualStage || 0) : (previousRank.visualStage || 0), 'result');
    app.querySelector('[data-result-kicker]').textContent = passed ? 'Ilha conquistada' : 'Travessia em treinamento';
    app.querySelector('[data-result-title]').textContent = passed ? 'Você venceu esta ilha!' : 'Ainda não foi dessa vez.';
    app.querySelector('[data-result-message]').textContent = passed
      ? buildVictoryMessage(run.phase, previousRank, nextRank, stars)
      : `Respire. Não fique triste: você fez ${percent}% e precisava de ${run.phase.minPercent}%. A próxima rodada vem com novos desafios desta ilha para tentar de novo.`;
    app.querySelector('[data-result-stars]').innerHTML = passed ? starHtml(stars, true) : starHtml(0, true);
    app.querySelector('[data-result-score]').textContent = `${run.score}/${run.questions.length}`;
    app.querySelector('[data-result-percent]').textContent = `${percent}%`;
    app.querySelector('[data-result-target]').textContent = `${run.phase.minPercent}%`;
    app.querySelector('[data-result-xp]').textContent = passed ? `+${earned.xp}` : '+0';
    app.querySelector('[data-result-coins]').textContent = passed ? `+${earned.coins}` : '+0';
    app.querySelector('[data-rank-unlock]').innerHTML = passed
      ? `<span class="tiny-label">Evolução desbloqueada</span><br><strong>${escapeHtml(previousRank.name || 'Patente anterior')} → ${escapeHtml(nextRank.name || 'nova patente')}</strong><p>${escapeHtml(nextRank.description || '')}</p>`
      : `<strong>Evolução ainda bloqueada:</strong> vença esta ilha para conquistar ${escapeHtml(nextRank.name || 'a próxima patente')}. Você pode tentar novamente quantas vezes precisar.`;
    const rewardBox = app.querySelector('[data-reward-unlock]');
    if (rewardBox) rewardBox.innerHTML = passed && reward
      ? `<span class="reward-icon">${escapeHtml(reward.icon)}</span><div><span class="tiny-label">Item da tartaruga conquistado</span><strong>${escapeHtml(reward.name)}</strong><p>${escapeHtml(reward.message)}</p></div>`
      : `<span class="reward-icon locked">🔒</span><div><strong>Item da tartaruga ainda bloqueado</strong><p>Volte para a ilha, preserve suas vidas e alcance a meta para liberar este item de evolução.</p></div>`;
    const mainButton = app.querySelector('[data-action="result-main"]');
    mainButton.textContent = passed ? 'Seguir para a próxima ilha' : 'Tentar uma nova rodada';
    mainButton.addEventListener('click', () => {
      if (passed) {
        const nextPhase = settings.phases.find(p => p.id === run.phase.id + 1);
        nextPhase ? startPhase(nextPhase.id) : renderHome();
      } else startPhase(run.phase.id);
    });
    app.querySelector('[data-action="back-home"]')?.addEventListener('click', renderHome);
  }

  function buildVictoryMessage(phase, previousRank, nextRank, stars) {
    const reward = getRewardForPhase(phase);
    const starText = stars === 5
      ? 'Você conquistou 5 estrelas: domínio máximo da ilha e travessia quase perfeita.'
      : `Você conquistou ${stars} estrela${stars > 1 ? 's' : ''}. Dá para voltar depois e buscar as 5 estrelas.`;
    const rewardText = reward ? ` Você também ganhou ${reward.name}: ${reward.message}` : '';
    if (nextRank?.visualStage >= 13) return `Travessia completa! Você venceu ${phase.title}, superou o Boss Final e alcançou ${nextRank.name}. ${starText}${rewardText}`;
    return `Sucesso! O caminho no mar foi desbloqueado. Você venceu ${phase.title} e evoluiu de ${previousRank?.name || 'sua patente anterior'} para ${nextRank?.name || 'a próxima patente'}. ${starText}${rewardText} Continue: a próxima ilha já está chamando.`;
  }

  function getRewardForPhase(phase) {
    if (!phase) return null;
    return settings.turtleRewards.find(item => Number(item.phaseId) === Number(phase.id)) || settings.turtleRewards[Number(phase.rewardItemIndex || 0)] || null;
  }

  function badgeSvg(icon = '🐢', stage = 0, mode = 'island') {
    const safe = escapeHtml(icon);
    return `<svg class="chem-badge stage-${Number(stage) || 0} ${mode}" viewBox="0 0 180 150" role="img" aria-label="${safe}">
      <ellipse cx="90" cy="132" rx="58" ry="13" fill="#d7b477" opacity=".76"/>
      <circle cx="90" cy="73" r="54" fill="#9be5df" opacity=".88"/>
      <ellipse cx="76" cy="48" rx="38" ry="13" fill="#d7fff9" opacity=".38"/>
      <text x="90" y="84" text-anchor="middle" dominant-baseline="middle" font-size="48">${safe}</text>
    </svg>`;
  }

  function starHtml(count, large = false) {
    const max = settings?.starsMax || 5;
    let out = '';
    for (let i = 1; i <= max; i++) out += `<span class="star ${i <= count ? 'filled' : ''} ${large ? 'large' : ''}">★</span>`;
    return out;
  }

  function islandIcon(index) { return ['⚛️','🧪','🔗','💧','⚖️','☢️','⏱️','🌊','🔋','🌋','🔥','🌿','🏆🦈'][index] || '🐢'; }
  function mapX(index) { return [8,30,56,79,52,24,10,37,64,84,55,28,82][index] || 50; }
  function mapY(index) { return [11,24,13,28,43,47,62,67,57,70,84,86,91][index] || 50; }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, Number.isFinite(v) ? v : min)); }
  function shuffleArray(array) { const copy = [...array]; for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; } return copy; }
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#039;', '"':'&quot;' }[char])); }
  function typesetMath() { if (window.MathJax?.typesetPromise) window.MathJax.typesetPromise().catch(() => {}); }
})();
