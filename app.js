/**
 * AI COACH - MAIN APPLICATION LOGIC
 * Huấn luyện năng lực tự chủ trong ra quyết định của học sinh THPT trong môi trường số
 */

const DEFAULT_PROMPT = (typeof window !== 'undefined' && window.DEFAULT_SYSTEM_PROMPT) ? window.DEFAULT_SYSTEM_PROMPT : '';

// 💡 CẤU HÌNH DÙNG CHUNG CHO CẢ LỚP/MỌI NGƯỜI:
// Nếu bạn muốn tất cả học sinh vào trang web là dùng được AI ngay mà không cần học sinh phải tự nhập key:
// Hãy dán Gemini API Key của bạn vào giữa 2 dấu ngoặc kép dưới đây (ví dụ: "AIzaSy..."):
const SHARED_DEFAULT_API_KEY = "";

// Application State
const STATE = {
  config: {
    provider: 'gemini',
    model: 'gemini-2.0-flash',
    apiKey: SHARED_DEFAULT_API_KEY,
    systemPrompt: DEFAULT_PROMPT,
    scaffoldLevel: '3' // 3: Cao, 2: Vừa, 1: Thấp, 0: Tự chủ
  },
  sessions: [],
  currentSessionId: null,
  isProcessing: false,
  recognition: null
};

// Trap keywords to detect in user messages
const DIGITAL_TRAPS = [
  { keyword: 'flash sale', label: 'Bẫy Flash Sale & Giảm giá sâu' },
  { keyword: 'đếm ngược', label: 'Đồng hồ đếm ngược gấp rút' },
  { keyword: 'chỉ còn', label: 'Tạo cảm giác khan hiếm' },
  { keyword: 'kol', label: 'Ảnh hưởng từ KOL / Người nổi tiếng' },
  { keyword: 'koc', label: 'Ảnh hưởng từ KOC Review' },
  { keyword: 'tiktok', label: 'Xu hướng mạng xã hội (TikTok)' },
  { keyword: 'trend', label: 'Tâm lý chạy theo xu hướng (Trend)' },
  { keyword: 'cả lớp', label: 'Áp lực từ số đông / Bạn bè' },
  { keyword: 'ai cũng', label: 'Tâm lý bầy đàn' },
  { keyword: 'fomo', label: 'Tâm lý sợ bỏ lỡ (FOMO)' },
  { keyword: 'chọn giúp', label: 'Ủy thác quyết định cho AI' },
  { keyword: 'chọn hộ', label: 'Ủy thác quyết định cho AI' },
  { keyword: 'quyết định luôn đi', label: 'Ủy thác quyết định cho AI' }
];

// Initialize application on DOM loaded
document.addEventListener('DOMContentLoaded', () => {
  loadConfig();
  loadSessions();
  setupEventListeners();
  setupSpeechRecognition();
  updateUI();
  lucide.createIcons();
});

// Load config from LocalStorage
function loadConfig() {
  const savedCfg = localStorage.getItem('ai_coach_config');
  if (savedCfg) {
    try {
      STATE.config = { ...STATE.config, ...JSON.parse(savedCfg) };
    } catch (e) {
      console.error('Lỗi đọc cấu hình:', e);
    }
  }

  if (!STATE.config.apiKey && SHARED_DEFAULT_API_KEY) {
    STATE.config.apiKey = SHARED_DEFAULT_API_KEY;
  }

  // Populate config fields in settings modal
  document.getElementById('cfg-provider').value = STATE.config.provider;
  document.getElementById('cfg-model').value = STATE.config.model;
  document.getElementById('cfg-apikey').value = STATE.config.apiKey;
  document.getElementById('cfg-system-prompt').value = STATE.config.systemPrompt;
  document.getElementById('select-scaffold-level').value = STATE.config.scaffoldLevel;

  updateScaffoldDisplay(STATE.config.scaffoldLevel);
  updateAPIStatusBadge();
}

// Save config to LocalStorage
function saveConfig() {
  STATE.config.provider = document.getElementById('cfg-provider').value;
  STATE.config.model = document.getElementById('cfg-model').value.trim();
  STATE.config.apiKey = document.getElementById('cfg-apikey').value.trim();
  STATE.config.systemPrompt = document.getElementById('cfg-system-prompt').value;
  STATE.config.scaffoldLevel = document.getElementById('select-scaffold-level').value;

  localStorage.setItem('ai_coach_config', JSON.stringify(STATE.config));
  updateScaffoldDisplay(STATE.config.scaffoldLevel);
  updateAPIStatusBadge();
}

// Load sessions from LocalStorage
function loadSessions() {
  const savedSessions = localStorage.getItem('ai_coach_sessions');
  if (savedSessions) {
    try {
      STATE.sessions = JSON.parse(savedSessions);
    } catch (e) {
      STATE.sessions = [];
    }
  }

  if (STATE.sessions.length > 0) {
    STATE.currentSessionId = STATE.sessions[0].id;
  } else {
    createNewSession();
  }
}

// Save sessions to LocalStorage
function saveSessions() {
  localStorage.setItem('ai_coach_sessions', JSON.stringify(STATE.sessions));
  renderHistoryList();
}

// Create new session
function createNewSession() {
  const newSession = {
    id: 'session_' + Date.now(),
    title: 'Tình huống ra quyết định mới',
    createdAt: new Date().toISOString(),
    scaffoldLevel: STATE.config.scaffoldLevel,
    completedNL: [1], // Default starts at recognizing problem
    messages: []
  };

  STATE.sessions.unshift(newSession);
  STATE.currentSessionId = newSession.id;
  saveSessions();
  renderCurrentSession();
}

// Get active session
function getCurrentSession() {
  return STATE.sessions.find(s => s.id === STATE.currentSessionId) || STATE.sessions[0];
}

// Setup Event Listeners
function setupEventListeners() {
  // New Chat
  document.getElementById('btn-new-chat').addEventListener('click', () => {
    createNewSession();
  });

  // Keyboard shortcut Ctrl+K / Cmd+K for new chat
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      createNewSession();
    }
  });

  // Scaffolding select
  document.getElementById('select-scaffold-level').addEventListener('change', (e) => {
    const level = e.target.value;
    STATE.config.scaffoldLevel = level;
    const session = getCurrentSession();
    if (session) session.scaffoldLevel = level;
    updateScaffoldDisplay(level);
    saveConfig();
    saveSessions();
  });

  // Send message button
  document.getElementById('btn-send-message').addEventListener('click', () => {
    handleSendMessage();
  });

  // Chat input Enter key
  const chatInput = document.getElementById('chat-input');
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  });

  // Auto-resize chat input
  chatInput.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 160) + 'px';
  });

  // Starters cards click
  document.querySelectorAll('.starter-card').forEach(card => {
    card.addEventListener('click', () => {
      const prompt = card.getAttribute('data-prompt');
      chatInput.value = prompt;
      handleSendMessage();
    });
  });

  // Quick suggestion pills click
  document.querySelectorAll('.quick-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const text = pill.getAttribute('data-text');
      chatInput.value = text;
      chatInput.focus();
    });
  });

  // Sidebar toggle
  const sidebar = document.getElementById('sidebar');
  document.getElementById('btn-toggle-sidebar').addEventListener('click', () => {
    sidebar.classList.toggle('-translate-x-full');
    sidebar.classList.toggle('hidden');
  });

  document.getElementById('close-sidebar-mobile').addEventListener('click', () => {
    sidebar.classList.add('hidden');
  });

  // Banner button to enter key
  const btnBannerKey = document.getElementById('btn-banner-enter-key');
  if (btnBannerKey) {
    btnBannerKey.addEventListener('click', () => {
      document.getElementById('settings-modal').classList.remove('hidden');
      document.querySelector('[data-tab="tab-api"]').click();
      document.getElementById('cfg-apikey').focus();
    });
  }

  // Clear current chat
  document.getElementById('btn-clear-chat').addEventListener('click', () => {
    if (confirm('Bạn có chắc muốn xóa nội dung cuộc trò chuyện này không?')) {
      const session = getCurrentSession();
      if (session) {
        session.messages = [];
        session.completedNL = [1];
        saveSessions();
        renderCurrentSession();
      }
    }
  });

  // Export current chat
  document.getElementById('btn-export-chat').addEventListener('click', () => {
    exportCurrentChatMarkdown();
  });

  // Settings Modal Controls
  const settingsModal = document.getElementById('settings-modal');
  document.getElementById('btn-open-settings').addEventListener('click', () => {
    settingsModal.classList.remove('hidden');
    renderSessionsTable();
    lucide.createIcons();
  });

  document.getElementById('btn-close-settings').addEventListener('click', () => {
    settingsModal.classList.add('hidden');
  });

  // Decision Map Modal Controls
  const decisionMapModal = document.getElementById('decision-map-modal');
  document.getElementById('btn-open-decision-map').addEventListener('click', () => {
    displayDecisionMapModal();
  });

  document.getElementById('btn-close-decision-map').addEventListener('click', () => {
    decisionMapModal.classList.add('hidden');
  });

  // Settings Tabs Switch
  document.querySelectorAll('.settings-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      document.querySelectorAll('.settings-tab-btn').forEach(b => {
        b.classList.remove('border-blue-600', 'text-blue-600');
        b.classList.add('border-transparent', 'text-slate-500');
      });
      btn.classList.add('border-blue-600', 'text-blue-600');
      btn.classList.remove('border-transparent', 'text-slate-500');

      ['tab-api', 'tab-prompt', 'tab-sessions', 'tab-deploy'].forEach(id => {
        document.getElementById(id).classList.toggle('hidden', id !== targetTab);
      });
    });
  });

  // Save Settings button
  document.getElementById('btn-save-settings').addEventListener('click', () => {
    saveConfig();
    alert('Đã lưu cài đặt thành công!');
    settingsModal.classList.add('hidden');
  });

  // Reset Prompt button
  document.getElementById('btn-reset-prompt').addEventListener('click', () => {
    if (confirm('Khôi phục lại nội dung huấn luyện chuẩn ban đầu?')) {
      document.getElementById('cfg-system-prompt').value = window.DEFAULT_SYSTEM_PROMPT || DEFAULT_PROMPT;
    }
  });

  // Test API button
  document.getElementById('btn-test-api').addEventListener('click', () => {
    testAPIConnection();
  });

  // Toggle API Key visibility
  document.getElementById('btn-toggle-key-vis').addEventListener('click', () => {
    const keyInput = document.getElementById('cfg-apikey');
    keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
  });

  // Export all sessions JSON
  document.getElementById('btn-export-all-data').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(STATE.sessions, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-coach-all-sessions-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // Clear all sessions
  document.getElementById('btn-clear-all-sessions').addEventListener('click', () => {
    if (confirm('CẢNH BÁO: Thao tác này sẽ xóa toàn bộ nhật ký học sinh trên trình duyệt này. Tiếp tục?')) {
      STATE.sessions = [];
      createNewSession();
      renderSessionsTable();
    }
  });

  // Open guide button
  document.getElementById('btn-open-guide').addEventListener('click', () => {
    settingsModal.classList.remove('hidden');
    document.querySelector('[data-tab="tab-deploy"]').click();
  });

  // Copy Decision Map
  document.getElementById('btn-copy-map').addEventListener('click', () => {
    const text = document.getElementById('decision-map-body').innerText;
    navigator.clipboard.writeText(text).then(() => {
      alert('Đã sao chép nội dung Bản đồ quyết định vào clipboard!');
    });
  });

  // Print Decision Map
  document.getElementById('btn-print-map').addEventListener('click', () => {
    window.print();
  });
}

// Update scaffolding display badge and descriptions
function updateScaffoldDisplay(level) {
  const badge = document.getElementById('scaffold-badge');
  const desc = document.getElementById('scaffold-desc');

  const configs = {
    '3': { text: 'Mức 3: Hỗ trợ cao', class: 'badge-scaffold-3', desc: 'AI đặt câu hỏi cụ thể, chia nhỏ vấn đề và nhắc nhở học sinh từng bước.' },
    '2': { text: 'Mức 2: Hỗ trợ vừa', class: 'badge-scaffold-2', desc: 'AI giảm bớt gợi ý, chủ yếu đặt câu hỏi phản biện, không suy luận thay.' },
    '1': { text: 'Mức 1: Hỗ trợ thấp', class: 'badge-scaffold-1', desc: 'AI chỉ đưa 1 câu hỏi định hướng, để học sinh tự hoàn thành các bước.' },
    '0': { text: 'Mức 0: Tự chủ', class: 'badge-scaffold-0', desc: 'Học sinh tự vận hành toàn bộ quá trình, AI chỉ phản hồi khi được hỏi.' }
  };

  const current = configs[level] || configs['3'];
  badge.textContent = current.text;
  badge.className = `px-2 py-0.5 rounded-full text-[11px] font-bold ${current.class}`;
  desc.textContent = current.desc;
}

// Update API Status Badge and Notification Banner
function updateAPIStatusBadge() {
  const badge = document.getElementById('api-status-badge');
  const banner = document.getElementById('missing-key-banner');

  if (STATE.config.provider === 'offline') {
    badge.className = 'w-2.5 h-2.5 rounded-full bg-amber-500 ring-2 ring-amber-500/20';
    badge.title = 'Chế độ Giả lập Ngoại tuyến';
    if (banner) banner.classList.remove('hidden');
  } else if (STATE.config.apiKey) {
    badge.className = 'w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-emerald-500/20';
    badge.title = `Đã kết nối AI thật (${STATE.config.provider.toUpperCase()})`;
    if (banner) banner.classList.add('hidden');
  } else {
    badge.className = 'w-2.5 h-2.5 rounded-full bg-amber-500 ring-2 ring-amber-500/20';
    badge.title = 'Chưa nhập API Key (Đang dùng mô phỏng)';
    if (banner) banner.classList.remove('hidden');
  }
}

// Web Speech API for voice dictation
function setupSpeechRecognition() {
  const btnVoice = document.getElementById('btn-voice-input');
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    btnVoice.style.display = 'none';
    return;
  }

  STATE.recognition = new SpeechRecognition();
  STATE.recognition.lang = 'vi-VN';
  STATE.recognition.continuous = false;
  STATE.recognition.interimResults = false;

  STATE.recognition.onstart = () => {
    btnVoice.classList.add('text-red-600', 'animate-pulse');
  };

  STATE.recognition.onend = () => {
    btnVoice.classList.remove('text-red-600', 'animate-pulse');
  };

  STATE.recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    const input = document.getElementById('chat-input');
    input.value = (input.value ? input.value + ' ' : '') + transcript;
    input.focus();
  };

  btnVoice.addEventListener('click', () => {
    try {
      STATE.recognition.start();
    } catch (e) {
      STATE.recognition.stop();
    }
  });
}

// Render sidebar conversation history list
function renderHistoryList() {
  const container = document.getElementById('chat-history-list');
  const items = container.querySelectorAll('.session-item');
  items.forEach(i => i.remove());

  STATE.sessions.forEach(session => {
    const isActive = session.id === STATE.currentSessionId;
    const item = document.createElement('div');
    item.className = `session-item group flex items-center justify-between px-3 py-2 rounded-xl text-xs cursor-pointer transition ${
      isActive ? 'bg-slate-800 text-white font-medium' : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
    }`;

    item.innerHTML = `
      <div class="flex items-center gap-2 overflow-hidden flex-1">
        <i data-lucide="message-square" class="w-3.5 h-3.5 flex-shrink-0 ${isActive ? 'text-blue-400' : 'text-slate-500'}"></i>
        <span class="truncate session-title">${escapeHTML(session.title)}</span>
      </div>
      <div class="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
        <button class="btn-rename p-1 hover:text-blue-400" title="Đổi tên">
          <i data-lucide="edit-2" class="w-3 h-3"></i>
        </button>
        <button class="btn-delete p-1 hover:text-red-400" title="Xóa">
          <i data-lucide="trash-2" class="w-3 h-3"></i>
        </button>
      </div>
    `;

    item.addEventListener('click', (e) => {
      if (e.target.closest('.btn-rename') || e.target.closest('.btn-delete')) return;
      STATE.currentSessionId = session.id;
      saveSessions();
      renderCurrentSession();
    });

    // Rename
    item.querySelector('.btn-rename').addEventListener('click', (e) => {
      e.stopPropagation();
      const newTitle = prompt('Nhập tiêu đề mới cho tình huống:', session.title);
      if (newTitle && newTitle.trim()) {
        session.title = newTitle.trim();
        saveSessions();
        renderCurrentSession();
      }
    });

    // Delete
    item.querySelector('.btn-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`Xóa tình huống "${session.title}"?`)) {
        STATE.sessions = STATE.sessions.filter(s => s.id !== session.id);
        if (STATE.sessions.length === 0) {
          createNewSession();
        } else {
          STATE.currentSessionId = STATE.sessions[0].id;
          saveSessions();
          renderCurrentSession();
        }
      }
    });

    container.appendChild(item);
  });

  lucide.createIcons();
}

// Render active session messages
function renderCurrentSession() {
  const session = getCurrentSession();
  if (!session) return;

  document.getElementById('current-chat-title').textContent = session.title;
  const messagesContainer = document.getElementById('chat-messages');
  const welcomeHero = document.getElementById('welcome-hero');

  // Update Scaffolding UI
  if (session.scaffoldLevel) {
    document.getElementById('select-scaffold-level').value = session.scaffoldLevel;
    updateScaffoldDisplay(session.scaffoldLevel);
  }

  // Update NL Progress Indicators
  updateNLIndicators(session.completedNL || [1]);

  if (!session.messages || session.messages.length === 0) {
    welcomeHero.classList.remove('hidden');
    const oldMessages = messagesContainer.querySelectorAll('.chat-bubble-row');
    oldMessages.forEach(el => el.remove());
    return;
  }

  welcomeHero.classList.add('hidden');
  const oldMessages = messagesContainer.querySelectorAll('.chat-bubble-row');
  oldMessages.forEach(el => el.remove());

  session.messages.forEach(msg => {
    appendMessageToDOM(msg);
  });

  messagesContainer.scrollTop = messagesContainer.scrollHeight;
  renderHistoryList();
}

// Update 6 Competencies indicators in sidebar
function updateNLIndicators(completedNL = []) {
  for (let i = 1; i <= 6; i++) {
    const el = document.getElementById(`nl-step-${i}`);
    if (el) {
      if (completedNL.includes(i)) {
        el.className = 'py-1 px-0.5 rounded bg-emerald-600 text-white text-[10px] font-mono font-bold shadow-sm';
      } else {
        el.className = 'py-1 px-0.5 rounded bg-slate-700 text-slate-400 text-[10px] font-mono';
      }
    }
  }

  const count = completedNL.length;
  document.getElementById('nl-progress-text').textContent = `${count}/6 đạt`;
}

// Append message element to DOM
function appendMessageToDOM(msg) {
  const container = document.getElementById('chat-messages');
  const isUser = msg.role === 'user';

  const row = document.createElement('div');
  row.className = `chat-bubble-row flex gap-3 max-w-3xl mx-auto w-full ${isUser ? 'justify-end' : 'justify-start'}`;

  if (isUser) {
    row.innerHTML = `
      <div class="flex flex-col items-end max-w-[85%]">
        <div class="bg-blue-600 text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm shadow-sm leading-relaxed">
          ${escapeHTML(msg.content)}
        </div>
        <span class="text-[10px] text-slate-400 mt-1 mr-1">Bạn • ${formatTime(msg.timestamp)}</span>
      </div>
      <div class="w-8 h-8 rounded-full bg-blue-100 border border-blue-200 text-blue-700 flex items-center justify-center font-bold text-xs flex-shrink-0 mt-1">
        HS
      </div>
    `;
  } else {
    // Coach message
    const parsedMarkdown = marked.parse(msg.content);
    const hasDecisionMap = msg.content.includes('BẢN ĐỒ QUYẾT ĐỊNH CỦA TÔI');

    row.innerHTML = `
      <div class="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center flex-shrink-0 mt-1 shadow-sm">
        <i data-lucide="compass" class="w-4 h-4"></i>
      </div>
      <div class="flex-1 max-w-[90%]">
        <div class="bg-slate-50 border border-slate-200 rounded-2xl rounded-tl-sm p-4 text-sm shadow-sm prose-chat text-slate-800">
          ${parsedMarkdown}
          ${hasDecisionMap ? `
            <div class="mt-3 pt-3 border-t border-slate-200 flex items-center gap-2">
              <button class="btn-view-map-inline px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 shadow transition">
                <i data-lucide="map" class="w-3.5 h-3.5"></i> Mở Bản Đồ Quyết Định Toàn Màn Hình
              </button>
            </div>
          ` : ''}
        </div>
        <div class="flex items-center gap-3 text-[10px] text-slate-400 mt-1.5 ml-1">
          <span>AI Coach • ${formatTime(msg.timestamp)}</span>
          <button class="btn-copy-msg hover:text-slate-600 flex items-center gap-1">
            <i data-lucide="copy" class="w-3 h-3"></i> Sao chép
          </button>
        </div>
      </div>
    `;

    // Copy action
    row.querySelector('.btn-copy-msg').addEventListener('click', () => {
      navigator.clipboard.writeText(msg.content);
      alert('Đã sao chép phản hồi của AI Coach!');
    });

    // Inline map button
    const mapBtn = row.querySelector('.btn-view-map-inline');
    if (mapBtn) {
      mapBtn.addEventListener('click', () => {
        displayDecisionMapModal(msg.content);
      });
    }
  }

  container.appendChild(row);
  lucide.createIcons();
  container.scrollTop = container.scrollHeight;
}

// Send Message Handler
async function handleSendMessage() {
  if (STATE.isProcessing) return;

  const input = document.getElementById('chat-input');
  const userText = input.value.trim();
  if (!userText) return;

  const session = getCurrentSession();
  if (!session) return;

  // Clear input
  input.value = '';
  input.style.height = 'auto';

  // Hide welcome hero
  document.getElementById('welcome-hero').classList.add('hidden');

  // Detect digital traps
  checkDigitalTraps(userText);

  // Add User Message
  const userMsg = {
    role: 'user',
    content: userText,
    timestamp: new Date().toISOString()
  };
  session.messages.push(userMsg);

  // If first message, generate title
  if (session.messages.length === 1) {
    session.title = userText.slice(0, 35) + (userText.length > 35 ? '...' : '');
  }

  appendMessageToDOM(userMsg);
  saveSessions();

  // Create Coach placeholder with typing indicator
  STATE.isProcessing = true;
  document.getElementById('btn-send-message').disabled = true;

  const coachPlaceholder = createTypingPlaceholder();
  document.getElementById('chat-messages').appendChild(coachPlaceholder);
  document.getElementById('chat-messages').scrollTop = document.getElementById('chat-messages').scrollHeight;

  try {
    let coachResponseText = '';

    // Check if real API key is available
    if (STATE.config.provider === 'offline' || !STATE.config.apiKey) {
      // Use enhanced dynamic simulation
      coachResponseText = await runOfflineSimulation(userText, session);
    } else if (STATE.config.provider === 'gemini') {
      coachResponseText = await callGeminiAPI(session);
    } else if (STATE.config.provider === 'openai') {
      coachResponseText = await callOpenAIAPI(session);
    }

    // Remove typing placeholder
    coachPlaceholder.remove();

    // Add Coach response
    const coachMsg = {
      role: 'assistant',
      content: coachResponseText,
      timestamp: new Date().toISOString()
    };
    session.messages.push(coachMsg);

    // Analyze competency progression
    evaluateNLProgress(session, userText, coachResponseText);

    appendMessageToDOM(coachMsg);
    saveSessions();

    // If decision map found, celebrate!
    if (coachResponseText.includes('BẢN ĐỒ QUYẾT ĐỊNH CỦA TÔI')) {
      triggerCelebration();
    }

  } catch (err) {
    console.error('Error generating AI response:', err);
    coachPlaceholder.remove();

    // Fallback gracefully to offline simulation if API call fails
    let fallbackText = '';
    try {
      fallbackText = await runOfflineSimulation(userText, session);
    } catch(e) {
      fallbackText = 'Chào em, hãy tiếp tục chia sẻ các căn cứ của mình để Coach đồng hành cùng em nhé!';
    }

    const fallbackMsg = {
      role: 'assistant',
      content: `*(Mạng AI tạm ngắt kết nối: ${err.message}. Coach đang hỗ trợ em ở chế độ ngoại tuyến)*\n\n` + fallbackText,
      timestamp: new Date().toISOString()
    };
    session.messages.push(fallbackMsg);
    appendMessageToDOM(fallbackMsg);
    saveSessions();
  } finally {
    STATE.isProcessing = false;
    document.getElementById('btn-send-message').disabled = false;
  }
}

// Create typing pulse bubble
function createTypingPlaceholder() {
  const row = document.createElement('div');
  row.className = 'chat-bubble-row flex gap-3 max-w-3xl mx-auto w-full justify-start typing-indicator-row';
  row.innerHTML = `
    <div class="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center flex-shrink-0 mt-1 shadow-sm">
      <i data-lucide="compass" class="w-4 h-4"></i>
    </div>
    <div class="bg-slate-100 border border-slate-200 rounded-2xl rounded-tl-sm px-5 py-4 flex items-center gap-2">
      <div class="dot-typing ml-3 mr-4"></div>
      <span class="text-xs text-slate-500 italic">AI Coach đang phân tích quá trình tư duy của bạn...</span>
    </div>
  `;
  lucide.createIcons();
  return row;
}

// Check digital traps in text
function checkDigitalTraps(text) {
  const lower = text.toLowerCase();
  const found = DIGITAL_TRAPS.find(t => lower.includes(t.keyword));
  const trapBox = document.getElementById('trap-alert-box');

  if (found) {
    trapBox.innerHTML = `
      <div class="trap-warning-banner">
        <i data-lucide="alert-triangle" class="w-3.5 h-3.5 text-amber-600"></i>
        <span>Phát hiện yếu tố số: ${found.label}</span>
      </div>
    `;
    trapBox.classList.remove('hidden');
    lucide.createIcons();
  } else {
    trapBox.classList.add('hidden');
  }
}

// Call Google Gemini API
async function callGeminiAPI(session) {
  const apiKey = STATE.config.apiKey;
  const model = STATE.config.model || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const scaffoldInstruction = `[CHẾ ĐỘ HUẤN LUYỆN HIỆN TẠI: MỨC ${session.scaffoldLevel || STATE.config.scaffoldLevel}]\n` +
    (session.scaffoldLevel === '3' ? 'Hỗ trợ cao: hãy đặt câu hỏi cụ thể, chia nhỏ vấn đề, gợi ý nhẹ và nhắc học sinh đang ở bước NL nào.' :
     session.scaffoldLevel === '2' ? 'Hỗ trợ vừa: giảm gợi ý, chủ yếu đặt câu hỏi phản biện, không suy luận thay học sinh.' :
     session.scaffoldLevel === '1' ? 'Hỗ trợ thấp: chỉ đưa 1 câu hỏi định hướng, để học sinh tự hoàn thành các bước.' :
     'Mức 0 Tự chủ: để học sinh tự làm chủ toàn bộ quá trình, chỉ phản hồi khi cần.');

  const contents = session.messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));

  const payload = {
    contents: contents,
    systemInstruction: {
      parts: [{ text: STATE.config.systemPrompt + "\n\n" + scaffoldInstruction }]
    },
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1500
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData?.error?.message || `HTTP ${response.status}`);
  }

  const data = await response.json();
  const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!reply) throw new Error('Không nhận được nội dung phản hồi từ Gemini API.');
  return reply;
}

// Call OpenAI API
async function callOpenAIAPI(session) {
  const apiKey = STATE.config.apiKey;
  const model = STATE.config.model || 'gpt-4o-mini';
  const url = 'https://api.openai.com/v1/chat/completions';

  const scaffoldInstruction = `[MỨC ĐỘ HỖ TRỢ: MỨC ${session.scaffoldLevel || STATE.config.scaffoldLevel}]`;

  const messages = [
    { role: 'system', content: STATE.config.systemPrompt + "\n\n" + scaffoldInstruction },
    ...session.messages.map(m => ({
      role: m.role,
      content: m.content
    }))
  ];

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      messages: messages,
      temperature: 0.7
    })
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData?.error?.message || `HTTP ${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || 'Không có phản hồi từ OpenAI.';
}

// ENHANCED DYNAMIC OFFLINE SIMULATION ENGINE (Never repeats the same single reply!)
async function runOfflineSimulation(userText, session) {
  await new Promise(r => setTimeout(r, 700));

  const lower = userText.toLowerCase();
  const userMsgCount = session.messages.filter(m => m.role === 'user').length;

  // RULE IX: Student asks AI to decide for them
  if (lower.includes('chọn giúp') || lower.includes('chọn hộ') || lower.includes('chọn cái nào') || lower.includes('quyết định luôn đi')) {
    return `Coach rất hiểu khi đứng trước nhiều lựa chọn, việc nhờ ai đó chọn hộ sẽ giúp mình đỡ phải đau đầu hơn. 

Tuy nhiên, **nguyên tắc cốt lõi của AI Coach là tuyệt đối không quyết định thay em**. Bởi vì quyết định này gắn liền với nhu cầu, điều kiện và trách nhiệm của chính em.

Để giúp em tự làm chủ quyết định, hãy cùng Coach làm rõ:
1. **Mục tiêu quan trọng nhất** của em trong việc này là gì?
2. Em có những tiêu chí bắt buộc nào (ví dụ: chi phí, thời gian, độ tin cậy)?
3. Điều gì đang khiến em băn khoăn nhất giữa các phương án?`;
  }

  // Detect Digital Traps
  if (lower.includes('flash sale') || lower.includes('đếm ngược') || lower.includes('giảm 70%') || lower.includes('kẻo hết')) {
    return `Coach nhận thấy tình huống này có yếu tố **Flash Sale và Đồng hồ đếm ngược gấp rút** ⏳. 

Đây là bẫy tâm lý số (**FOMO - Sợ bỏ lỡ**) nhằm khiến người mua hành động theo cảm xúc vội vàng thay vì căn cứ thực tế.

Em hãy dừng lại một chút và trả lời 2 câu hỏi sau:
1. **Nhu cầu thực tế:** Nếu sản phẩm này không giảm giá, em có thực sự cần nó ngay lúc này không?
2. **Căn cứ kiểm chứng:** Em đã kiểm tra đánh giá từ các nguồn độc lập chưa, hay chỉ đang xem bình luận trên trang bán lẻ?`;
  }

  if (lower.includes('koc') || lower.includes('kol') || lower.includes('cả lớp') || lower.includes('đu trend') || lower.includes('ai cũng')) {
    return `Nhìn thấy bạn bè hoặc một KOL/KOC nổi tiếng khen ngợi một điều gì đó rất dễ tạo nên áp lực tâm lý muốn làm theo số đông.

Để trở thành **chủ thể độc lập của quyết định**, em hãy thử:
1. Tạm bỏ qua ý kiến của KOL và các bạn, việc này **giải quyết đúng nhu cầu nào của bản thân em**?
2. KOL/KOC đó có đang nhận tài trợ quảng cáo từ nhãn hàng không? Em đã tìm thấy bằng chứng khách quan nào khác chưa?`;
  }

  // DYNAMIC CONVERSATION TURNS: Adapts to student's progress across NL1 -> NL6
  if (userMsgCount === 1) {
    // NL1: Clarifying problem and goal
    return `Chào em! Coach đã ghi nhận vấn đề: *"**${escapeHTML(userText)}**"*. 

Để bắt đầu bước đầu tiên (**NL1 – Nhận diện vấn đề và Xác định mục tiêu**), em hãy chia sẻ thêm cùng Coach:
1. **Mục tiêu quan trọng nhất** mà em muốn đạt được sau quyết định này là gì?
2. Có yếu tố cảm xúc (thích nhất thời, áp lực bạn bè, xu hướng mạng xã hội) nào đang thôi thúc em không?`;
  }

  if (userMsgCount === 2) {
    // NL2 & NL3: Information gathering & verification
    return `Rất tốt! Em đã xác định rõ mục tiêu của mình. Bây giờ chúng ta cùng bước sang (**NL2 & NL3 – Tìm kiếm & Kiểm chứng thông tin**):

1. Để quyết định việc này một cách chắc chắn, em **đang cần thêm những thông tin cụ thể nào**?
2. Em dự định sẽ **tìm kiếm thông tin đó ở những nguồn nào** (người có chuyên môn, sách báo chính thống, hay bài viết mạng)?
3. Làm sao để em biết các thông tin đó là **đáng tin cậy và không mang tính quảng cáo**?`;
  }

  if (userMsgCount === 3) {
    // NL4: Weighing options
    return `Tuyệt vời, thông tin có căn cứ sẽ là nền tảng vững chắc nhất! Bây giờ chúng ta sang bước (**NL4 – Xác định và Cân nhắc các phương án**):

1. Hiện tại trước mắt em đang có **những phương án cụ thể nào** (Ví dụ: Phương án A, Phương án B, hoặc Trì hoãn chưa chọn vội)?
2. **Lợi ích lớn nhất** và **rủi ro/hạn chế** của từng phương án là gì?
3. Phương án nào có vẻ **sát với mục tiêu ban đầu** của em hơn?`;
  }

  if (userMsgCount === 4) {
    // NL5: Making decision based on evidence
    return `Em đã phân tích rất thấu đáo các mặt lợi và hại của từng lựa chọn! Giờ là lúc thực hiện (**NL5 – Ra quyết định và Giải thích quyết định**):

Em hãy tự tin trả lời Coach:
👉 **"Em lựa chọn phương án nào, và lý do/căn cứ quan trọng nhất cho quyết định này là gì?"** 
*(Hãy chắc chắn rằng quyết định này đến từ chính em chứ không phải vì làm theo số đông nhé!)*`;
  }

  // Turn 5+ or when user makes a choice -> Generate Decision Map (NL6)
  return `Chúc mừng em! Em đã hoàn thành trọn vẹn hành trình tư duy tự chủ từ nhận diện vấn đề, kiểm chứng thông tin cho đến đưa ra lựa chọn có căn cứ vững vàng. 👏

Coach xin tổng kết toàn bộ quá trình thành:

🧭 **BẢN ĐỒ QUYẾT ĐỊNH CỦA TÔI**

1. **Vấn đề tôi cần giải quyết:**  
   ${session.title}
2. **Mục tiêu của tôi:**  
   Giải quyết đúng nhu cầu thực tế, không bị chi phối bởi cảm xúc nhất thời hay áp lực mạng xã hội.
3. **Thông tin tôi đã tìm kiếm:**  
   Thu thập các thông tin đa chiều, lắng nghe các góc nhìn độc lập.
4. **Thông tin tôi đã kiểm chứng:**  
   Xác định rõ nguồn cung cấp, nhận diện các bẫy thông tin số và đối chiếu chứng cứ.
5. **Các phương án tôi cân nhắc:**  
   Đã so sánh chi tiết ưu - nhược điểm và rủi ro của từng lựa chọn.
6. **Phương án tôi lựa chọn:**  
   ${userText}
7. **Căn cứ cho quyết định:**  
   Lựa chọn dựa trên sự phù hợp cao nhất với mục tiêu dài hạn và khả năng thực tế của bản thân.
8. **Kết quả cần theo dõi:**  
   Quan sát thực tế trong thời gian tới xem quyết định này có mang lại hiệu quả như kỳ vọng ban đầu không.
9. **Nếu kết quả chưa đạt mục tiêu, tôi sẽ điều chỉnh:**  
   Sẵn sàng phản tư, tìm thêm thông tin mới và điều chỉnh hành động linh hoạt.

---
> *"Tự chủ không có nghĩa là luôn đưa ra quyết định đúng. Tự chủ là biết dừng lại, tìm kiếm, kiểm chứng, cân nhắc, lựa chọn có căn cứ và nhìn lại quyết định của chính mình."*`;
}

// Evaluate Competency Progression NL1 -> NL6
function evaluateNLProgress(session, userText, coachText) {
  if (!session.completedNL) session.completedNL = [1];

  const lowerU = userText.toLowerCase();
  const lowerC = coachText.toLowerCase();

  if (session.messages.length >= 2 && !session.completedNL.includes(1)) {
    session.completedNL.push(1);
  }
  if ((lowerU.includes('thông tin') || lowerU.includes('tìm thấy') || lowerU.includes('nguồn')) && !session.completedNL.includes(2)) {
    session.completedNL.push(2);
  }
  if ((lowerU.includes('kiểm chứng') || lowerU.includes('tin cậy') || lowerU.includes('bằng chứng') || lowerU.includes('koc')) && !session.completedNL.includes(3)) {
    session.completedNL.push(3);
  }
  if ((lowerU.includes('phương án') || lowerU.includes('lựa chọn') || lowerU.includes('so sánh')) && !session.completedNL.includes(4)) {
    session.completedNL.push(4);
  }
  if ((lowerU.includes('em chọn') || lowerU.includes('quyết định') || lowerU.includes('chốt')) && !session.completedNL.includes(5)) {
    session.completedNL.push(5);
  }
  if ((coachText.includes('BẢN ĐỒ QUYẾT ĐỊNH CỦA TÔI') || lowerU.includes('phản tư') || lowerU.includes('điều chỉnh')) && !session.completedNL.includes(6)) {
    session.completedNL.push(6);
  }

  updateNLIndicators(session.completedNL);
}

// Test API Connection
async function testAPIConnection() {
  const resultSpan = document.getElementById('api-test-result');
  resultSpan.textContent = 'Đang kiểm tra kết nối...';
  resultSpan.className = 'text-xs font-medium text-slate-500';

  const provider = document.getElementById('cfg-provider').value;
  const apiKey = document.getElementById('cfg-apikey').value.trim();
  const model = document.getElementById('cfg-model').value.trim();

  if (provider === 'offline') {
    resultSpan.textContent = '✓ Chế độ Giả lập Offline sẵn sàng hoạt động (Không cần API key)';
    resultSpan.className = 'text-xs font-medium text-emerald-600';
    return;
  }

  if (!apiKey) {
    resultSpan.textContent = '❌ Vui lòng nhập API Key trước khi kiểm tra!';
    resultSpan.className = 'text-xs font-medium text-rose-600';
    return;
  }

  try {
    if (provider === 'gemini') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Trả lời đúng 1 từ: OK' }] }]
        })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      resultSpan.textContent = '✓ Kết nối Google Gemini API thành công!';
      resultSpan.className = 'text-xs font-medium text-emerald-600';
    } else {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      resultSpan.textContent = '✓ Kết nối OpenAI API thành công!';
      resultSpan.className = 'text-xs font-medium text-emerald-600';
    }
  } catch (err) {
    resultSpan.textContent = `❌ Lỗi: ${err.message}`;
    resultSpan.className = 'text-xs font-medium text-rose-600';
  }
}

// Render Sessions Table in Admin modal
function renderSessionsTable() {
  const tbody = document.getElementById('sessions-table-body');
  tbody.innerHTML = '';

  if (STATE.sessions.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-slate-400 italic">Chưa có phiên trò chuyện nào.</td></tr>';
    return;
  }

  STATE.sessions.forEach((s) => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50 transition';
    tr.innerHTML = `
      <td class="p-3 font-medium text-slate-800">${escapeHTML(s.title)}</td>
      <td class="p-3 text-slate-500">${new Date(s.createdAt).toLocaleDateString('vi-VN')} ${new Date(s.createdAt).toLocaleTimeString('vi-VN', {hour: '2-digit', minute: '2-digit'})}</td>
      <td class="p-3"><span class="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-mono text-[11px]">${s.messages.length}</span></td>
      <td class="p-3"><span class="px-2 py-0.5 rounded text-[11px] font-bold ${s.scaffoldLevel === '0' ? 'badge-scaffold-0' : 'badge-scaffold-3'}">Mức ${s.scaffoldLevel || '3'}</span></td>
      <td class="p-3 text-right">
        <button class="btn-load-session text-blue-600 hover:underline mr-2" data-id="${s.id}">Mở</button>
        <button class="btn-del-session text-red-600 hover:underline" data-id="${s.id}">Xóa</button>
      </td>
    `;

    tr.querySelector('.btn-load-session').addEventListener('click', () => {
      STATE.currentSessionId = s.id;
      renderCurrentSession();
      document.getElementById('settings-modal').classList.add('hidden');
    });

    tr.querySelector('.btn-del-session').addEventListener('click', () => {
      if (confirm(`Xóa phiên "${s.title}"?`)) {
        STATE.sessions = STATE.sessions.filter(item => item.id !== s.id);
        if (STATE.sessions.length === 0) createNewSession();
        saveSessions();
        renderSessionsTable();
      }
    });

    tbody.appendChild(tr);
  });
}

// Display Decision Map Modal
function displayDecisionMapModal(content = null) {
  const modal = document.getElementById('decision-map-modal');
  const target = document.getElementById('decision-map-body');

  const session = getCurrentSession();
  let mapText = '';

  if (content && content.includes('BẢN ĐỒ QUYẾT ĐỊNH CỦA TÔI')) {
    mapText = content;
  } else if (session) {
    const coachMsgWithMap = [...session.messages].reverse().find(m => m.role === 'assistant' && m.content.includes('BẢN ĐỒ QUYẾT ĐỊNH CỦA TÔI'));
    if (coachMsgWithMap) {
      mapText = coachMsgWithMap.content;
    }
  }

  if (mapText) {
    target.innerHTML = marked.parse(mapText);
  } else {
    target.innerHTML = `
      <div class="text-center py-8 space-y-2">
        <i data-lucide="compass" class="w-10 h-10 text-slate-300 mx-auto"></i>
        <p class="text-slate-500 font-medium">Chưa có Bản đồ quyết định hoàn chỉnh trong cuộc hội thoại này.</p>
        <p class="text-xs text-slate-400">Hãy tiếp tục trò chuyện với AI Coach để hoàn thành các bước từ NL1 đến NL5 và chốt quyết định có căn cứ của bạn nhé!</p>
      </div>
    `;
    lucide.createIcons();
  }

  modal.classList.remove('hidden');
}

// Trigger celebratory confetti effect
function triggerCelebration() {
  if (typeof confetti === 'function') {
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 }
    });
  }
}

// Export current chat to Markdown
function exportCurrentChatMarkdown() {
  const session = getCurrentSession();
  if (!session) return;

  let md = `# ${session.title}\n\n`;
  md += `*Thời gian tạo: ${new Date(session.createdAt).toLocaleString('vi-VN')}*\n`;
  md += `*Mức hỗ trợ: Mức ${session.scaffoldLevel || '3'}*\n\n`;
  md += `---\n\n`;

  session.messages.forEach(m => {
    const sender = m.role === 'user' ? '👤 **Học sinh**' : '🧭 **AI Coach**';
    md += `### ${sender} (${formatTime(m.timestamp)}):\n\n${m.content}\n\n---\n\n`;
  });

  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${session.title.replace(/[^a-zA-Z0-9\u00C0-\u024F\u1E00-\u1EFF]/g, '_')}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

// Format time string
function formatTime(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

// Escape HTML
function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

// Update UI
function updateUI() {
  renderHistoryList();
  renderCurrentSession();
}
