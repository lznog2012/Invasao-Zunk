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

  // Se estiver na estante, vai pra home
  if (current.id === 'view-shelf') {
    btn.href = '/';
    btn.textContent = '← VOLTAR À ESTAÇÃO';
  } else {
    // Se estiver em qualquer outra view, volta pra estante
    btn.href = '#';
    btn.textContent = '← VOLTAR À ESTANTE';
    btn.onclick = (e) => {
      e.preventDefault();
      viewHistory = [];
      showView('view-shelf', { pushHistory: false });
    };
  }
}

// ============================================
// NAVEGAÇÃO — LIVROS
// ============================================
function openBook(section) {
  currentSection = section;

  if (section === 'mundos') {
    // Mundos abre o sistema solar
    renderSolarSystem();
    showView('view-worlds');
  } else if (section === 'zunk') {
    // Zunk abre o aviso do cofre
    showView('view-vault-warning');
  } else {
    // Outros abrem a view de artigo (por enquanto com placeholder)
    renderSectionPlaceholder(section);
    showView('view-article');
  }
}

// ============================================
// PLACEHOLDER DE SEÇÃO (temporário até Etapa 2)
// ============================================
function renderSectionPlaceholder(section) {
  const container = document.getElementById('articleContent');
  const breadcrumb = document.getElementById('articleBreadcrumb');
  if (!container) return;

  const info = {
    historia: { icone: '📖', nome: 'História', range: '001-006' },
    politica: { icone: '⚖️', nome: 'Política & Economia', range: '200-205' },
    jogos:    { icone: '🎮', nome: 'Os Jogos', range: '300-302' }
  };

  const data = info[section] || { icone: '📚', nome: section, range: '???' };

  if (breadcrumb) {
    breadcrumb.innerHTML = `📚 Biblioteca › ${data.icone} ${data.nome}`;
  }

  container.innerHTML = `
    <header>
      <span class="archive-number">${data.icone} ${data.nome}</span>
      <h1>${data.nome}</h1>
      <div class="meta">
        <span>Arquivos ${data.range}</span>
        <span>Em breve: lista completa de artigos</span>
      </div>
    </header>
    <div class="article-body">
      <p><em>Esta seção será preenchida na próxima etapa.</em></p>
      <p>Aqui vai aparecer a lista de todos os artigos de <strong>${data.nome}</strong>.</p>
      <p>Quando você clicar em um artigo, ele abrirá em tela cheia com o conteúdo completo.</p>
      <h3>Por enquanto...</h3>
      <p>Você pode testar o botão <strong>← Voltar à Estante</strong> para retornar ao hub da biblioteca.</p>
    </div>
    <footer class="article-footer">
      <button class="article-nav-btn" disabled>← Anterior</button>
      <button class="article-nav-btn" disabled>Próximo →</button>
    </footer>
  `;
}

// ============================================
// SISTEMA SOLAR (placeholder até Etapa 3)
// ============================================
function renderSolarSystem() {
  const solar = document.getElementById('solarSystem');
  if (!solar) return;

  // Limpa
  solar.innerHTML = '';

  // Sol
  const sun = document.createElement('div');
  sun.className = 'sun';
  solar.appendChild(sun);

  // Planetas (posição relativa a partir do sol no centro)
  const planets = [
    { nome: 'RIMK',       imagem: 'rimkopolis.png', cor: '#aaff00', tamanho: 180, velocidade: 30 },
    { nome: 'SAHRIN',     imagem: 'kaal7.png',      cor: '#ffcc00', tamanho: 260, velocidade: 45 },
    { nome: 'NEREID',     imagem: 'nereida.png',    cor: '#00ffcc', tamanho: 340, velocidade: 60 },
    { nome: 'FERRUM',     imagem: 'ferrum.png',     cor: '#ff3344', tamanho: 420, velocidade: 75 }
  ];

  planets.forEach(p => {
    // Órbita
    const orbit = document.createElement('div');
    orbit.className = 'orbit';
    orbit.style.width = p.tamanho + 'px';
    orbit.style.height = p.tamanho + 'px';
    orbit.style.animationDuration = p.velocidade + 's';
    solar.appendChild(orbit);

    // Planeta (wrapper que orbita)
    const wrapper = document.createElement('div');
    wrapper.className = 'planet-wrapper';
    wrapper.style.left = '100%';
    wrapper.style.top = '50%';

    // Botão do planeta
    const btn = document.createElement('button');
    btn.className = 'planet-btn';
    btn.style.setProperty('--planet-color', p.cor);
    btn.style.backgroundImage = `url('/images/planetas/${p.imagem}')`;
    btn.style.animationDuration = p.velocidade + 's';
    btn.title = `Explorar ${p.nome}`;
    btn.onclick = () => openPlanet(p.nome);

    // Label embaixo
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
      const current = document.querySelector('.view.active');
      if (current && current.id !== 'view-shelf') {
        e.preventDefault();
        viewHistory = [];
        showView('view-shelf', { pushHistory: false });
      }
      // senão deixa ir pra home normal
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
