// ==================================================
// BIBLIOTECA DE RIMKANDRIA — Navegação e Lógica
// ==================================================

// ============================================
// ESTADO DA NAVEGAÇÃO
// ============================================
let viewHistory = [];        // pilha de views visitadas
let currentSection = null;   // seção atual (historia, mundos, etc)
let currentArticle = null;   // artigo atual (001, 002, etc)

// ============================================
// CARREGAMENTO DE DADOS (JSON)
// ============================================
const JSON_CACHE = {};

async function loadSection(section) {
  if (JSON_CACHE[section]) return JSON_CACHE[section];

  try {
    const resp = await fetch(`data/${section}.json`);
    if (!resp.ok) throw new Error(`Erro ao carregar ${section}.json`);
    const data = await resp.json();
    JSON_CACHE[section] = data;
    return data;
  } catch (err) {
    console.error(`Erro carregando ${section}:`, err);
    return null;
  }
}

// ============================================
// TROCA DE VIEWS
// ============================================
function showView(viewId, options = {}) {
  const { pushHistory = true, section = null, article = null } = options;

  // Guarda a view atual na história
  if (pushHistory) {
    const current = document.querySelector('.view.active');
    if (current && current.id !== viewId) {
      viewHistory.push(current.id);
    }
  }

  // Esconde todas as views
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));

  // Mostra a view desejada
  const target = document.getElementById(viewId);
  if (target) {
    target.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Atualiza estado
  if (section) currentSection = section;
  if (article) currentArticle = article;

  // Atualiza botão global de voltar
  updateGlobalBackBtn();
}

function goBack() {
  if (viewHistory.length === 0) {
    // Volta pra home
    window.location.href = '/';
    return;
  }

  const previousView = viewHistory.pop();

  // Esconde todas
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));

  // Mostra a anterior
  const target = document.getElementById(previousView);
  if (target) {
    target.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  updateGlobalBackBtn();
}

function updateGlobalBackBtn() {
  const btn = document.getElementById('globalBackBtn');
  if (!btn) return;

  const current = document.querySelector('.view.active');
  if (!current) return;

  // Se estiver na estante, o botão vai pra home normalmente (href="/")
  // Se estiver em outra view, precisa voltar pra estante via JS
  if (current.id === 'view-shelf') {
    btn.href = '/';
    btn.textContent = '← VOLTAR À ESTAÇÃO';
    btn.dataset.action = 'home';
  } else {
    btn.href = '#';
    btn.textContent = '← VOLTAR À ESTANTE';
    btn.dataset.action = 'shelf';
  }
}

// ============================================
// NAVEGAÇÃO — LIVROS
// ============================================
async function openBook(section) {
  currentSection = section;

  if (section === 'mundos') {
    renderSolarSystem();
    showView('view-worlds');
    return;
  }

  if (section === 'zunk') {
    showView('view-vault-warning');
    return;
  }

  // Seções com JSON (historia, ciencia, politica, jogos)
  await renderSectionList(section);
  showView('view-article');
}

// ============================================
// LISTA DE ARTIGOS DE UMA SEÇÃO
// ============================================
async function renderSectionList(section) {
  const container = document.getElementById('articleContent');
  const breadcrumb = document.getElementById('articleBreadcrumb');
  if (!container) return;

  container.innerHTML = '<header><h1>Carregando...</h1></header>';

  const data = await loadSection(section);
  if (!data) {
    container.innerHTML = '<header><h1>Erro ao carregar</h1></header><div class="article-body"><p>Não foi possível carregar esta seção.</p></div>';
    return;
  }

  if (breadcrumb) {
    breadcrumb.innerHTML = `📚 Biblioteca › ${data.icone} ${data.nome}`;
  }

  const cards = data.artigos.map(art => `
    <div class="article-card" onclick="openArticle('${section}', '${art.numero}')">
      <div class="article-card-number">ARQUIVO #${art.numero}</div>
      <h3>${art.icone} ${art.titulo}</h3>
      <div class="article-card-meta">por ${art.autor} · ${art.data}</div>
      <div class="article-card-cta">Ler artigo →</div>
    </div>
  `).join('');

  container.innerHTML = `
    <header>
      <span class="archive-number">${data.icone} SEÇÃO ${data.range}</span>
      <h1>${data.nome}</h1>
      <div class="meta">
        <span>${data.artigos.length} arquivos disponíveis</span>
      </div>
    </header>
    <div class="article-list">
      ${cards}
    </div>
    <footer class="article-footer">
      <button class="article-nav-btn" onclick="goBack()">← Voltar à Estante</button>
    </footer>
  `;

  if (typeof attachSoundsLore === 'function') {
    setTimeout(attachSoundsLore, 100);
  }
}

// ============================================
// RENDERIZAR ARTIGO INDIVIDUAL
// ============================================
async function openArticle(section, numero) {
  const container = document.getElementById('articleContent');
  const breadcrumb = document.getElementById('articleBreadcrumb');
  if (!container) return;

  container.innerHTML = '<header><h1>Carregando...</h1></header>';

  const data = await loadSection(section);
  if (!data) return;

  const index = data.artigos.findIndex(a => a.numero === numero);
  const artigo = data.artigos[index];
  if (!artigo) return;

  const anterior = data.artigos[index - 1];
  const proximo = data.artigos[index + 1];

  if (breadcrumb) {
    breadcrumb.innerHTML = `📚 Biblioteca › ${data.icone} ${data.nome} › #${numero}`;
  }

  container.innerHTML = `
    <header>
      <span class="archive-number">ARQUIVO #${artigo.numero}</span>
      <h1>${artigo.titulo}</h1>
      <div class="meta">
        <span>por ${artigo.autor}</span>
        <span>${artigo.data}</span>
      </div>
    </header>
    <div class="article-body">
      ${artigo.conteudo}
    </div>
    <footer class="article-footer">
      ${anterior
        ? `<button class="article-nav-btn" onclick="openArticle('${section}', '${anterior.numero}')">← ${anterior.titulo}</button>`
        : `<button class="article-nav-btn" disabled>← Início da Linha</button>`
      }
      <button class="article-nav-btn" onclick="renderSectionList('${section}')">📖 Lista Completa</button>
      ${proximo
        ? `<button class="article-nav-btn" onclick="openArticle('${section}', '${proximo.numero}')">${proximo.titulo} →</button>`
        : `<button class="article-nav-btn" disabled>Fim da Linha →</button>`
      }
    </footer>
  `;

  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (typeof attachSoundsLore === 'function') {
    setTimeout(attachSoundsLore, 100);
  }
}

// ============================================
// SISTEMA SOLAR (placeholder até Etapa 3)
// ============================================
function renderSolarSystem() {
  const solar = document.getElementById('solarSystem');
  if (!solar) return;

  solar.innerHTML = '';

  // Sol
  const sun = document.createElement('div');
  sun.className = 'sun';
  solar.appendChild(sun);

  // Planetas — cada um com um offset inicial pra não alinhar
  const planets = [
    { nome: 'FERRUM',     imagem: 'ferrum.png',     cor: '#ff3344', tamanho: 20, velocidade: 30, offset: 0 },
    { nome: 'KAAL-7',     imagem: 'kaal7.png',      cor: '#ffcc00', tamanho: 40, velocidade: 45, offset: 90 },
    { nome: 'RIMKÓPOLIS', imagem: 'rimkopolis.png', cor: '#aaff00', tamanho: 60, velocidade: 60, offset: 200 },
    { nome: 'NEREIDA',    imagem: 'nereida.png',    cor: '#00ffcc', tamanho: 80, velocidade: 75, offset: 305 }
  ];

  planets.forEach(p => {
    // Órbita
    const orbit = document.createElement('div');
    orbit.className = 'orbit';
    orbit.style.width = p.tamanho + '%';
    orbit.style.height = p.tamanho + '%';
    orbit.style.animationDuration = p.velocidade + 's';
    // ⚡ Delay negativo faz começar em posição diferente
    orbit.style.animationDelay = `-${(p.offset / 360) * p.velocidade}s`;
    solar.appendChild(orbit);

    // Planeta
    const wrapper = document.createElement('div');
    wrapper.className = 'planet-wrapper';

    const btn = document.createElement('button');
    btn.className = 'planet-btn';
    btn.style.setProperty('--planet-color', p.cor);
    btn.style.backgroundImage = `url('/images/planetas/${p.imagem}')`;
    btn.style.animationDuration = p.velocidade + 's';
    btn.style.animationDelay = `-${(p.offset / 360) * p.velocidade}s`;
    btn.title = `Explorar ${p.nome}`;
    btn.onclick = () => openPlanet(p.nome);

    const label = document.createElement('span');
    label.className = 'planet-label';
    label.style.setProperty('--planet-color', p.cor);
    label.textContent = p.nome;

    btn.appendChild(label);
    wrapper.appendChild(btn);
    orbit.appendChild(wrapper);
  });
}

function openPlanet(nome) {
  // Placeholder até a Etapa 3
  const container = document.getElementById('articleContent');
  const breadcrumb = document.getElementById('articleBreadcrumb');

  if (breadcrumb) {
    breadcrumb.innerHTML = `📚 Biblioteca › 🪐 Mundos › ${nome}`;
  }

  container.innerHTML = `
    <header>
      <span class="archive-number">🪐 PLANETA</span>
      <h1>${nome}</h1>
      <div class="meta">
        <span>Ficha completa em breve</span>
      </div>
    </header>
    <div class="article-body">
      <p><em>Esta ficha será preenchida na Etapa 3.</em></p>
      <p>Aqui vai aparecer:</p>
      <ul style="padding-left: 20px; line-height: 2;">
        <li>👽 <strong>Os Povos</strong> (primeira seção)</li>
        <li>🗺️ Geografia</li>
        <li>🌦️ Clima</li>
        <li>⚖️ Política</li>
        <li>🎭 Cultura</li>
        <li>🏛️ Arquitetura</li>
        <li>🍲 Culinária</li>
      </ul>
    </div>
    <footer class="article-footer">
      <button class="article-nav-btn" onclick="showView('view-worlds', { pushHistory: false }); viewHistory = [];">← Voltar ao Sistema Solar</button>
    </footer>
  `;

  showView('view-article');
}

// ============================================
// COFRE ZUNK
// ============================================
function acceptVault() {
  renderVaultPlaceholder();
  showView('view-vault-content');
}

function cancelVault() {
  showView('view-shelf', { pushHistory: false });
  viewHistory = [];
}

function renderVaultPlaceholder() {
  const container = document.getElementById('vaultContent');
  const breadcrumb = document.getElementById('articleBreadcrumb');

  if (breadcrumb) {
    breadcrumb.innerHTML = `📚 Biblioteca › 🔴 Arquivo Zunk`;
  }

  container.innerHTML = `
    <header>
      <span class="archive-number">⚠️ CONFIDENCIAL</span>
      <h1>ARQUIVO ZUNK</h1>
      <div class="meta">
        <span>Comissão de Defesa do Sistema Rímkar</span>
        <span>Ano 847 da Aliança</span>
      </div>
    </header>
    <div class="article-body">
      <p><em>Este arquivo será preenchido na Etapa 4.</em></p>
      <p>Aqui vai estar o <strong>relatório completo</strong> sobre os Zunks:</p>
      <ul style="padding-left: 20px; line-height: 2;">
        <li>📋 <strong>O Que Sabemos</strong> — fatos confirmados</li>
        <li>❓ <strong>O Que Suspeitamos</strong> — hipóteses</li>
        <li>🕳️ <strong>O Que Não Sabemos</strong> — lacunas</li>
        <li>🟣 <strong>Os Vharn</strong> — perfil da casta roxa</li>
        <li>⚪ <strong>Os Thrakk</strong> — perfil da casta branca</li>
        <li>🎭 <strong>Metamorfos</strong> — a arte da camuflagem</li>
      </ul>
      <p>Alguns trechos aparecerão como <span class="censored">████████████</span> — informação corrompida ou censurada.</p>
    </div>
    <footer class="article-footer">
      <button class="article-nav-btn" onclick="goBack()">← Voltar à Estante</button>
    </footer>
  `;
}

// ============================================
// INICIALIZAÇÃO
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  // Aplica cliques nos cards-livro
  document.querySelectorAll('.book-card').forEach(card => {
    card.addEventListener('click', () => {
      const section = card.dataset.section;
      openBook(section);
    });
  });

  // Aplica clique no cofre
  const vaultCard = document.querySelector('.vault-card');
  if (vaultCard) {
    vaultCard.addEventListener('click', () => openBook('zunk'));
  }

    // Botão global voltar (topo esquerdo)
  const globalBtn = document.getElementById('globalBackBtn');
  if (globalBtn) {
    globalBtn.addEventListener('click', (e) => {
      // Se estamos na estante, deixa ir pra home (href="/")
      if (globalBtn.dataset.action === 'home') {
        return; // comportamento padrão do <a>
      }
      // Senão, força voltar pra estante
      e.preventDefault();
      viewHistory = [];
      showView('view-shelf', { pushHistory: false });
    });
  }

  // Botão "← Voltar à Estante" dentro da view de artigo
  const btnBackToShelf = document.getElementById('btnBackToShelf');
  if (btnBackToShelf) {
    btnBackToShelf.addEventListener('click', () => {
      viewHistory = [];
      showView('view-shelf', { pushHistory: false });
    });
  }

  // Botão "← Voltar à Estante" dentro da view de mundos
  const btnBackFromWorlds = document.getElementById('btnBackFromWorlds');
  if (btnBackFromWorlds) {
    btnBackFromWorlds.addEventListener('click', () => {
      viewHistory = [];
      showView('view-shelf', { pushHistory: false });
    });
  }

  // Botão "← Voltar à Estante" dentro do cofre
  const btnBackFromVault = document.getElementById('btnBackFromVault');
  if (btnBackFromVault) {
    btnBackFromVault.addEventListener('click', () => {
      viewHistory = [];
      showView('view-shelf', { pushHistory: false });
    });
  }

  // Botões do aviso do cofre
  const btnAccept = document.getElementById('btnAcceptVault');
  const btnCancel = document.getElementById('btnCancelVault');
  if (btnAccept) btnAccept.addEventListener('click', acceptVault);
  if (btnCancel) btnCancel.addEventListener('click', cancelVault);

  // Inicializa o botão global
  updateGlobalBackBtn();
});

// ============================================
// SISTEMA DE ÁUDIO (funciona em mobile)
// ============================================
let audioCtxLore = null;
let audioUnlockedLore = false;

function initAudioLore() {
  if (audioCtxLore) return;
  try {
    audioCtxLore = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) {}
}

function unlockAudioLore() {
  if (audioUnlockedLore) return;
  initAudioLore();
  if (!audioCtxLore) return;

  if (audioCtxLore.state === 'suspended') {
    audioCtxLore.resume().then(() => { audioUnlockedLore = true; });
  } else {
    audioUnlockedLore = true;
  }
}

['click', 'touchstart', 'keydown'].forEach(evt => {
  document.addEventListener(evt, unlockAudioLore, { once: true, passive: true });
});

// Sons
function playSoundLore(freq, duration, type, vol) {
  if (!audioCtxLore || !audioUnlockedLore) return;
  try {
    const osc = audioCtxLore.createOscillator();
    const gain = audioCtxLore.createGain();
    osc.type = type || 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol || 0.04, audioCtxLore.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtxLore.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtxLore.destination);
    osc.start();
    osc.stop(audioCtxLore.currentTime + duration);
  } catch (e) {}
}

function playSeqLore(notes) {
  if (!audioCtxLore || !audioUnlockedLore) return;
  let t = 0;
  notes.forEach(n => {
    setTimeout(() => playSoundLore(n[0], n[1], n[2] || 'square', n[3] || 0.04), t);
    t += n[1] * 1000 * 0.85;
  });
}

function soundHoverLore() {
  playSoundLore(1400, 0.04, 'square', 0.02);
}

function soundClickLore() {
  playSeqLore([[1600, 0.04, 'square', 0.04], [2000, 0.06, 'square', 0.035]]);
}

function soundOpenBook() {
  // Som de virar página / abrir livro
  playSeqLore([[880, 0.05], [1320, 0.06], [1100, 0.08], [880, 0.06]]);
}

function toggleSoundLore() {
  audioUnlockedLore = !audioUnlockedLore;
  const btn = document.getElementById('soundToggle');
  if (btn) {
    btn.innerText = audioUnlockedLore ? '🔊' : '🔇';
    btn.classList.toggle('muted', !audioUnlockedLore);
  }
  if (audioUnlockedLore) {
    initAudioLore();
    if (audioCtxLore && audioCtxLore.state === 'suspended') {
      audioCtxLore.resume();
    }
  }
}

// Aplica sons em todos os elementos interativos
function attachSoundsLore() {
  const selectors = [
    '.book-card',
    '.vault-card',
    '.planet-btn',
    '.article-back',
    '.article-nav-btn',
    '.warning-cancel',
    '.warning-accept',
    '.back-btn',
    '.sound-toggle'
  ];

  selectors.forEach(sel => {
    document.querySelectorAll(sel).forEach(el => {
      if (el.dataset.soundAttached) return;
      el.dataset.soundAttached = 'true';

      el.addEventListener('mouseenter', soundHoverLore);

      el.addEventListener('click', (e) => {
        // Card-livro tem som especial de "abrir"
        if (el.classList.contains('book-card')) {
          soundOpenBook();
        } else {
          soundClickLore();
        }
      });
    });
  });
}

// Aplica quando carregar
window.addEventListener('DOMContentLoaded', attachSoundsLore);
// Reaplica após abrir uma view nova (novos elementos aparecem)
const originalShowView = showView;
showView = function(...args) {
  originalShowView.apply(this, args);
  setTimeout(attachSoundsLore, 100);
};
