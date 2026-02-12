const state = {
  matchId: null,
  players: ['Jogador 1', 'Jogador 2'],
  scores: [0, 0],
  currentPlayer: 0,
  targetPoints: 30,
  currentBall: 1,
  maxBall: 7,
  running: false,
  stream: null,
  rafId: 0,
  prevGray: null,
  motionThreshold: 6,
  lastMotionEventAt: 0,
  lastMovementAt: 0,
  moving: false,
  apiOnline: false,
  pendingStateWrite: false,
  cvReady: false,
  autoReferee: true,
  frameCounter: 0,
  tableRect: null,
  pockets: [],
  trackedBalls: {},
  missingCounters: {
    white: 0,
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
    6: 0,
    7: 0,
  },
};

const refs = {
  form: document.querySelector('#match-form'),
  scoreboard: document.querySelector('#scoreboard'),
  p0: document.querySelector('#p0'),
  p1: document.querySelector('#p1'),
  turnLabel: document.querySelector('#turn-label'),
  ballLabel: document.querySelector('#ball-label'),
  statusLabel: document.querySelector('#status-label'),
  eventLog: document.querySelector('#event-log'),
  recentMatches: document.querySelector('#recent-matches'),
  video: document.querySelector('#video'),
  overlayCanvas: document.querySelector('#overlay-canvas'),
  canvas: document.querySelector('#processing-canvas'),
  btnCamera: document.querySelector('#btn-camera'),
  btnStopCamera: document.querySelector('#btn-stop-camera'),
  btnPot: document.querySelector('#btn-pot'),
  btnTurn: document.querySelector('#btn-turn'),
  btnFoul: document.querySelector('#btn-foul'),
  manualButtons: document.querySelector('#manual-buttons'),
  threshold: document.querySelector('#threshold'),
  thresholdValue: document.querySelector('#threshold-value'),
  motionValue: document.querySelector('#motion-value'),
  motionState: document.querySelector('#motion-state'),
  meterFill: document.querySelector('#meter-fill'),
  playerA: document.querySelector('#player-a'),
  playerB: document.querySelector('#player-b'),
  targetPoints: document.querySelector('#target-points'),
  apiState: document.querySelector('#api-state'),
  matchId: document.querySelector('#match-id'),
  secureBanner: document.querySelector('#secure-banner'),
  opencvState: document.querySelector('#opencv-state'),
  tableState: document.querySelector('#table-state'),
  pocketsState: document.querySelector('#pockets-state'),
  detectedBalls: document.querySelector('#detected-balls'),
  autoReferee: document.querySelector('#auto-referee'),
};

const ctx = refs.canvas.getContext('2d', { willReadFrequently: true });
const overlayCtx = refs.overlayCanvas.getContext('2d');

const BALL_PROFILES = {
  white: [[0, 0, 190], [180, 40, 255]],
  1: [[20, 80, 80], [38, 255, 255]],
  2: [[95, 80, 40], [130, 255, 255]],
  3: [
    [[0, 100, 60], [8, 255, 255]],
    [[170, 100, 60], [180, 255, 255]],
  ],
  4: [[130, 60, 40], [155, 255, 255]],
  5: [[9, 100, 80], [18, 255, 255]],
  6: [[40, 70, 50], [85, 255, 255]],
  7: [[0, 0, 0], [180, 255, 55]],
};

const BALL_DRAW_COLORS = {
  white: '#f5f5f5',
  1: '#f2b84b',
  2: '#4b8cf2',
  3: '#da574f',
  4: '#8f6bd9',
  5: '#d9783b',
  6: '#4bb96f',
  7: '#1f1f1f',
};

function timestamp() {
  return new Date().toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

async function apiFetch(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}

function setApiOnline(online) {
  state.apiOnline = online;
  refs.apiState.textContent = online ? 'online' : 'offline';
}

function logEvent(text, opts = {}) {
  const item = document.createElement('li');
  item.textContent = `[${timestamp()}] ${text}`;
  refs.eventLog.prepend(item);

  while (refs.eventLog.children.length > 120) {
    refs.eventLog.removeChild(refs.eventLog.lastChild);
  }

  if (opts.persist !== false) {
    persistEvent(opts.eventType || 'event', text, opts.payload || null);
  }
}

async function persistEvent(eventType, message, payload) {
  if (!state.matchId) {
    return;
  }

  try {
    await apiFetch(`/api/matches/${state.matchId}/events`, {
      method: 'POST',
      body: JSON.stringify({ eventType, message, payload }),
    });
    setApiOnline(true);
  } catch (_error) {
    setApiOnline(false);
  }
}

async function persistMatchState() {
  if (!state.matchId || state.pendingStateWrite) {
    return;
  }

  state.pendingStateWrite = true;

  try {
    await apiFetch(`/api/matches/${state.matchId}/state`, {
      method: 'POST',
      body: JSON.stringify({
        scoreA: state.scores[0],
        scoreB: state.scores[1],
        currentPlayer: state.currentPlayer,
        currentBall: state.currentBall,
        status: state.running ? 'running' : 'finished',
        winner: state.running ? null : state.players[state.scores[0] > state.scores[1] ? 0 : 1],
      }),
    });
    setApiOnline(true);
  } catch (_error) {
    setApiOnline(false);
  } finally {
    state.pendingStateWrite = false;
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function switchTurn() {
  state.currentPlayer = state.currentPlayer === 0 ? 1 : 0;
}

function getOpponentIndex() {
  return state.currentPlayer === 0 ? 1 : 0;
}

function finishMatch(winnerIdx) {
  state.running = false;
  refs.statusLabel.textContent = `Partida encerrada. Vencedor: ${state.players[winnerIdx]}`;
  logEvent(`Fim de partida: ${state.players[winnerIdx]} venceu.`, { eventType: 'match_finished' });
  persistMatchState();
}

function checkWinner() {
  if (state.scores[0] >= state.targetPoints || state.scores[1] >= state.targetPoints) {
    const winner = state.scores[0] >= state.targetPoints ? 0 : 1;
    finishMatch(winner);
  }
}

function addPoints(playerIndex, points, reason, eventType = 'score') {
  if (!state.running) {
    return;
  }

  state.scores[playerIndex] += points;
  logEvent(`${state.players[playerIndex]} +${points} (${reason})`, { eventType, payload: { playerIndex, points, reason } });
  renderScoreboard();
  checkWinner();
  persistMatchState();
}

function renderPlayerCard(index) {
  const card = refs[`p${index}`];
  card.classList.toggle('active', state.currentPlayer === index && state.running);
  card.innerHTML = `<h3>${state.players[index]}</h3><p>${state.scores[index]} pts</p>`;
}

function renderScoreboard() {
  renderPlayerCard(0);
  renderPlayerCard(1);
  refs.turnLabel.textContent = state.players[state.currentPlayer] ?? '-';
  refs.ballLabel.textContent = String(state.currentBall);
  refs.matchId.textContent = state.matchId ? String(state.matchId) : '-';

  if (!state.running) {
    if (state.scores[0] === 0 && state.scores[1] === 0) {
      refs.statusLabel.textContent = 'Partida pronta para iniciar';
    }
    return;
  }

  refs.statusLabel.textContent = 'Partida em andamento';
}

function nextBall() {
  state.currentBall += 1;
  if (state.currentBall > state.maxBall) {
    state.currentBall = 1;
    logEvent('Sequencia de bolas reiniciada para 1.', { eventType: 'ball_cycle' });
  }
}

function buildManualButtons() {
  for (let points = 1; points <= 7; points += 1) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = `+${points}`;
    btn.addEventListener('click', () => {
      addPoints(state.currentPlayer, points, 'ajuste manual', 'manual_score');
    });
    refs.manualButtons.appendChild(btn);
  }
}

async function createMatchOnServer(playerA, playerB, targetPoints) {
  const data = await apiFetch('/api/matches', {
    method: 'POST',
    body: JSON.stringify({ playerA, playerB, targetPoints }),
  });
  return data.match;
}

async function onStartMatch(event) {
  event.preventDefault();

  const a = refs.playerA.value.trim() || 'Jogador 1';
  const b = refs.playerB.value.trim() || 'Jogador 2';
  const target = clamp(Number(refs.targetPoints.value) || 30, 1, 999);

  try {
    const match = await createMatchOnServer(a, b, target);
    setApiOnline(true);
    state.matchId = match.id;
    state.players = [a, b];
    state.scores = [0, 0];
    state.currentPlayer = 0;
    state.targetPoints = target;
    state.currentBall = 1;
    state.running = true;

    refs.scoreboard.classList.remove('hidden');
    renderScoreboard();
    logEvent(`Nova partida: ${a} x ${b} (meta ${target} pts).`, { eventType: 'match_started', persist: false });
    await loadRecentMatches();
  } catch (_error) {
    setApiOnline(false);
    logEvent('Falha ao criar partida no backend. Verifique API/banco.', { persist: false });
  }
}

function onPotBall(source = 'manual') {
  if (!state.running) {
    return;
  }

  const ballValue = state.currentBall;
  addPoints(state.currentPlayer, ballValue, `encacapou bola ${ballValue} (${source})`, source === 'opencv' ? 'opencv_pot' : 'pot');
  nextBall();
  renderScoreboard();
  persistMatchState();
}

function onFoul(source = 'manual') {
  if (!state.running) {
    return;
  }

  const rival = getOpponentIndex();
  addPoints(rival, 4, `falta do adversario (${source})`, source === 'opencv' ? 'opencv_foul' : 'foul');
  switchTurn();
  renderScoreboard();
  persistMatchState();
}

function onTurnChange() {
  if (!state.running) {
    return;
  }

  switchTurn();
  renderScoreboard();
  logEvent(`Troca de vez. Agora: ${state.players[state.currentPlayer]}.`, { eventType: 'turn_change' });
  persistMatchState();
}

async function loadRecentMatches() {
  try {
    const data = await apiFetch('/api/matches?limit=8');
    refs.recentMatches.innerHTML = '';

    if (!data.items.length) {
      const li = document.createElement('li');
      li.textContent = 'Sem partidas salvas ainda.';
      refs.recentMatches.appendChild(li);
      return;
    }

    for (const match of data.items) {
      const li = document.createElement('li');
      const winner = match.winner ? ` | vencedor: ${match.winner}` : '';
      li.textContent = `#${match.id} ${match.player_a} ${match.score_a} x ${match.score_b} ${match.player_b} | ${match.status}${winner}`;
      refs.recentMatches.appendChild(li);
    }

    setApiOnline(true);
  } catch (_error) {
    setApiOnline(false);
    refs.recentMatches.innerHTML = '<li>Falha ao carregar historico.</li>';
  }
}

async function startCamera() {
  if (state.stream) {
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });

    state.stream = stream;
    refs.video.srcObject = stream;
    await refs.video.play();
    logEvent('Camera ligada com sucesso.', { eventType: 'camera_on' });

    state.prevGray = null;
    if (state.rafId) {
      cancelAnimationFrame(state.rafId);
    }
    monitorMotion();
  } catch (_error) {
    logEvent('Falha ao ligar camera. Verifique permissoes do navegador.', { persist: false });
  }
}

function stopCamera() {
  if (state.rafId) {
    cancelAnimationFrame(state.rafId);
    state.rafId = 0;
  }

  if (state.stream) {
    for (const track of state.stream.getTracks()) {
      track.stop();
    }
    state.stream = null;
  }

  refs.video.srcObject = null;
  state.prevGray = null;
  state.moving = false;
  state.tableRect = null;
  state.pockets = [];
  state.trackedBalls = {};
  refs.motionState.textContent = 'Parado';
  refs.motionValue.textContent = '0.00%';
  refs.meterFill.style.width = '0%';
  refs.tableState.textContent = 'nao detectada';
  refs.pocketsState.textContent = '0/6';
  refs.detectedBalls.textContent = 'nenhuma';
  if (overlayCtx) {
    overlayCtx.clearRect(0, 0, refs.overlayCanvas.width, refs.overlayCanvas.height);
  }
  logEvent('Camera desligada.', { eventType: 'camera_off' });
}

function computeMotionPercent(currentGray, previousGray) {
  let changed = 0;
  const total = currentGray.length;

  for (let i = 0; i < total; i += 1) {
    if (Math.abs(currentGray[i] - previousGray[i]) > 22) {
      changed += 1;
    }
  }

  return (changed / total) * 100;
}

function toGrayScale(rgba) {
  const gray = new Uint8Array(rgba.length / 4);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 1) {
    gray[j] = (rgba[i] * 77 + rgba[i + 1] * 150 + rgba[i + 2] * 29) >> 8;
  }
  return gray;
}

function buildMaskFromProfile(hsv, profile) {
  const cv = window.cv;
  const lower = new cv.Mat(hsv.rows, hsv.cols, hsv.type());
  const upper = new cv.Mat(hsv.rows, hsv.cols, hsv.type());
  let mask = null;

  if (Array.isArray(profile[0][0])) {
    for (const [l, u] of profile) {
      const localMask = new cv.Mat();
      lower.setTo(new cv.Scalar(l[0], l[1], l[2], 0));
      upper.setTo(new cv.Scalar(u[0], u[1], u[2], 255));
      cv.inRange(hsv, lower, upper, localMask);
      if (!mask) {
        mask = localMask;
      } else {
        cv.bitwise_or(mask, localMask, mask);
        localMask.delete();
      }
    }
  } else {
    mask = new cv.Mat();
    lower.setTo(new cv.Scalar(profile[0][0], profile[0][1], profile[0][2], 0));
    upper.setTo(new cv.Scalar(profile[1][0], profile[1][1], profile[1][2], 255));
    cv.inRange(hsv, lower, upper, mask);
  }

  lower.delete();
  upper.delete();
  return mask;
}

function detectColorCircles(hsv, profile) {
  const cv = window.cv;
  const mask = buildMaskFromProfile(hsv, profile);
  const circles = new cv.Mat();

  try {
    cv.GaussianBlur(mask, mask, new cv.Size(7, 7), 0, 0, cv.BORDER_DEFAULT);
    cv.HoughCircles(mask, circles, cv.HOUGH_GRADIENT, 1.2, 16, 75, 14, 4, 20);

    const found = [];
    for (let i = 0; i < circles.cols; i += 1) {
      const base = i * 4;
      found.push({
        x: circles.data32F[base],
        y: circles.data32F[base + 1],
        r: circles.data32F[base + 2],
      });
    }
    mask.delete();
    circles.delete();
    return found.sort((a, b) => b.r - a.r);
  } catch (_error) {
    mask.delete();
    circles.delete();
    return [];
  }
}

function detectTableRect(hsv) {
  const cv = window.cv;
  const mask = new cv.Mat();
  const lower = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), new cv.Scalar(35, 40, 30, 0));
  const upper = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), new cv.Scalar(95, 255, 255, 255));
  const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(9, 9));
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();

  cv.inRange(hsv, lower, upper, mask);
  cv.morphologyEx(mask, mask, cv.MORPH_OPEN, kernel);
  cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, kernel);
  cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

  let bestRect = null;
  let bestArea = 0;
  const minArea = (hsv.cols * hsv.rows) * 0.18;

  for (let i = 0; i < contours.size(); i += 1) {
    const contour = contours.get(i);
    const rect = cv.boundingRect(contour);
    const area = rect.width * rect.height;
    contour.delete();

    if (area > bestArea && area > minArea) {
      bestArea = area;
      bestRect = rect;
    }
  }

  lower.delete();
  upper.delete();
  kernel.delete();
  contours.delete();
  hierarchy.delete();
  mask.delete();

  return bestRect;
}

function buildPocketsFromTable(tableRect) {
  if (!tableRect) {
    return [];
  }

  const r = Math.max(8, Math.round(Math.min(tableRect.width, tableRect.height) * 0.055));
  const left = tableRect.x;
  const right = tableRect.x + tableRect.width;
  const top = tableRect.y;
  const bottom = tableRect.y + tableRect.height;
  const mid = tableRect.x + (tableRect.width / 2);

  return [
    { name: 'sup-esq', x: left, y: top, r },
    { name: 'sup-centro', x: mid, y: top, r },
    { name: 'sup-dir', x: right, y: top, r },
    { name: 'inf-esq', x: left, y: bottom, r },
    { name: 'inf-centro', x: mid, y: bottom, r },
    { name: 'inf-dir', x: right, y: bottom, r },
  ];
}

function summarizeTrackedBalls(trackedBalls) {
  const keys = Object.keys(trackedBalls).filter((k) => trackedBalls[k] && trackedBalls[k].length);
  if (!keys.length) {
    return 'nenhuma';
  }

  return keys
    .filter((k) => k !== 'white')
    .sort((a, b) => Number(a) - Number(b))
    .map((k) => `${k}(${trackedBalls[k].length})`)
    .join(', ') || 'nenhuma';
}

function countBallsNearPockets(trackedBalls, pockets) {
  if (!pockets.length) {
    return 0;
  }

  let count = 0;
  for (const entries of Object.values(trackedBalls)) {
    for (const ball of entries) {
      const near = pockets.some((pocket) => {
        const dx = ball.x - pocket.x;
        const dy = ball.y - pocket.y;
        return Math.hypot(dx, dy) <= (pocket.r * 1.35);
      });
      if (near) {
        count += 1;
      }
    }
  }
  return count;
}

function toOverlayPoint(framePoint, frameWidth, frameHeight) {
  const scaleX = refs.overlayCanvas.width / frameWidth;
  const scaleY = refs.overlayCanvas.height / frameHeight;
  return {
    x: framePoint.x * scaleX,
    y: framePoint.y * scaleY,
  };
}

function drawTrackingOverlay(frameWidth, frameHeight) {
  if (!overlayCtx) {
    return;
  }

  const width = refs.overlayCanvas.width;
  const height = refs.overlayCanvas.height;
  overlayCtx.clearRect(0, 0, width, height);

  if (state.tableRect) {
    const p = toOverlayPoint({ x: state.tableRect.x, y: state.tableRect.y }, frameWidth, frameHeight);
    const w = (state.tableRect.width / frameWidth) * width;
    const h = (state.tableRect.height / frameHeight) * height;
    overlayCtx.strokeStyle = 'rgba(96, 245, 180, 0.95)';
    overlayCtx.lineWidth = 2;
    overlayCtx.strokeRect(p.x, p.y, w, h);
  }

  for (const pocket of state.pockets) {
    const p = toOverlayPoint(pocket, frameWidth, frameHeight);
    const r = (pocket.r / frameWidth) * width;
    overlayCtx.beginPath();
    overlayCtx.arc(p.x, p.y, r, 0, Math.PI * 2);
    overlayCtx.strokeStyle = 'rgba(255, 214, 120, 0.95)';
    overlayCtx.lineWidth = 2;
    overlayCtx.stroke();
  }

  for (const [ballKey, entries] of Object.entries(state.trackedBalls)) {
    for (const ball of entries) {
      const p = toOverlayPoint(ball, frameWidth, frameHeight);
      const r = (ball.r / frameWidth) * width;
      overlayCtx.beginPath();
      overlayCtx.arc(p.x, p.y, r, 0, Math.PI * 2);
      overlayCtx.strokeStyle = BALL_DRAW_COLORS[ballKey] || '#ffffff';
      overlayCtx.lineWidth = 2;
      overlayCtx.stroke();
      overlayCtx.font = '12px Space Grotesk';
      overlayCtx.fillStyle = '#f8f6ef';
      overlayCtx.fillText(ballKey, p.x + r + 3, p.y - r - 3);
    }
  }
}

function opencvDetectionLoop() {
  if (!state.cvReady || !state.stream || refs.video.readyState < 2) {
    return;
  }

  state.frameCounter += 1;
  if (state.frameCounter % 3 !== 0) {
    return;
  }

  const cv = window.cv;
  const width = 480;
  const height = 270;
  refs.canvas.width = width;
  refs.canvas.height = height;
  const overlayWidth = refs.video.videoWidth || 640;
  const overlayHeight = refs.video.videoHeight || 360;
  if (refs.overlayCanvas.width !== overlayWidth || refs.overlayCanvas.height !== overlayHeight) {
    refs.overlayCanvas.width = overlayWidth;
    refs.overlayCanvas.height = overlayHeight;
  }
  ctx.drawImage(refs.video, 0, 0, width, height);

  const src = cv.imread(refs.canvas);
  const hsv = new cv.Mat();
  cv.cvtColor(src, hsv, cv.COLOR_RGBA2RGB);
  cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV);

  state.tableRect = detectTableRect(hsv);
  state.pockets = buildPocketsFromTable(state.tableRect);
  refs.tableState.textContent = state.tableRect ? 'detectada' : 'nao detectada';

  const trackedBalls = {};
  const seen = {};
  for (const key of Object.keys(BALL_PROFILES)) {
    const circles = detectColorCircles(hsv, BALL_PROFILES[key]);
    trackedBalls[key] = circles.slice(0, 3);
    seen[key] = circles.length > 0;
  }
  state.trackedBalls = trackedBalls;
  const nearPocketCount = countBallsNearPockets(trackedBalls, state.pockets);
  refs.pocketsState.textContent = `${state.pockets.length}/6 | bolas perto: ${nearPocketCount}`;

  src.delete();
  hsv.delete();
  refs.detectedBalls.textContent = summarizeTrackedBalls(trackedBalls);
  drawTrackingOverlay(width, height);

  for (const key of Object.keys(state.missingCounters)) {
    if (seen[key]) {
      state.missingCounters[key] = 0;
    } else {
      state.missingCounters[key] += 1;
    }
  }

  if (!state.autoReferee || !state.running || state.moving) {
    return;
  }

  const closeToPlayStop = performance.now() - state.lastMovementAt < 2500;
  if (!closeToPlayStop) {
    return;
  }

  const currentKey = String(state.currentBall);
  if (state.missingCounters[currentKey] >= 10) {
    state.missingCounters[currentKey] = 0;
    logEvent(`OpenCV: bola ${currentKey} ausente apos jogada. Pontuacao automatica.`, {
      eventType: 'opencv_decision',
      payload: { currentBall: Number(currentKey) },
    });
    onPotBall('opencv');
    return;
  }

  if (state.missingCounters.white >= 12) {
    state.missingCounters.white = 0;
    logEvent('OpenCV: branca ausente apos jogada. Falta automatica.', {
      eventType: 'opencv_decision',
      payload: { foul: 'white_missing' },
    });
    onFoul('opencv');
  }
}

function monitorMotion() {
  if (!state.stream) {
    return;
  }

  const width = 280;
  const height = 160;
  refs.canvas.width = width;
  refs.canvas.height = height;

  const loop = () => {
    if (!state.stream || refs.video.readyState < 2) {
      state.rafId = requestAnimationFrame(loop);
      return;
    }

    ctx.drawImage(refs.video, 0, 0, width, height);
    const frame = ctx.getImageData(0, 0, width, height);
    const gray = toGrayScale(frame.data);

    if (state.prevGray) {
      const motionPercent = computeMotionPercent(gray, state.prevGray);
      refs.motionValue.textContent = `${motionPercent.toFixed(2)}%`;
      refs.meterFill.style.width = `${Math.min(motionPercent * 4, 100)}%`;

      const now = performance.now();
      const threshold = state.motionThreshold;

      if (motionPercent >= threshold) {
        refs.motionState.textContent = 'Movimento detectado';

        if (!state.moving) {
          state.moving = true;
          logEvent('Movimento iniciado na mesa.', { eventType: 'motion_start' });
        }

        state.lastMovementAt = now;

        if (now - state.lastMotionEventAt > 1500) {
          state.lastMotionEventAt = now;
          logEvent(`Evento de movimento (${motionPercent.toFixed(1)}%).`, {
            eventType: 'motion_pulse',
            payload: { motionPercent },
          });
        }
      } else {
        if (state.moving && now - state.lastMovementAt > 700) {
          state.moving = false;
          refs.motionState.textContent = 'Parado';
          logEvent('Mesa estabilizada.', { eventType: 'motion_stop' });
        }

        if (!state.moving) {
          refs.motionState.textContent = 'Parado';
        }
      }
    }

    state.prevGray = gray;
    opencvDetectionLoop();
    state.rafId = requestAnimationFrame(loop);
  };

  state.rafId = requestAnimationFrame(loop);
}

function onThresholdChange() {
  state.motionThreshold = Number(refs.threshold.value);
  refs.thresholdValue.textContent = `${state.motionThreshold}%`;
}

function updateOpencvStateUi() {
  if (state.cvReady) {
    refs.opencvState.textContent = 'pronto';
    return;
  }

  refs.opencvState.textContent = 'carregando...';
}

function waitForOpenCv() {
  const maxWaitMs = 15000;
  const start = performance.now();

  const tick = () => {
    if (window.__opencvLoaded && window.cv && typeof window.cv.Mat === 'function') {
      state.cvReady = true;
      updateOpencvStateUi();
      return;
    }

    if (performance.now() - start > maxWaitMs) {
      state.cvReady = false;
      refs.opencvState.textContent = 'indisponivel';
      return;
    }

    setTimeout(tick, 250);
  };

  tick();
}

function checkSecureContext() {
  const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const isHttps = window.location.protocol === 'https:';
  refs.secureBanner.classList.toggle('hidden', isHttps || isLocalhost);
}

function bindEvents() {
  refs.form.addEventListener('submit', onStartMatch);
  refs.btnPot.addEventListener('click', () => onPotBall('manual'));
  refs.btnTurn.addEventListener('click', onTurnChange);
  refs.btnFoul.addEventListener('click', () => onFoul('manual'));
  refs.btnCamera.addEventListener('click', startCamera);
  refs.btnStopCamera.addEventListener('click', stopCamera);
  refs.threshold.addEventListener('input', onThresholdChange);
  refs.autoReferee.addEventListener('change', (event) => {
    state.autoReferee = event.target.checked;
    logEvent(`Arbitragem automatica ${state.autoReferee ? 'ativada' : 'desativada'}.`, {
      eventType: 'auto_referee_toggle',
      payload: { enabled: state.autoReferee },
    });
  });

  window.addEventListener('beforeunload', () => {
    stopCamera();
  });
}

function init() {
  bindEvents();
  buildManualButtons();
  renderScoreboard();
  onThresholdChange();
  checkSecureContext();
  waitForOpenCv();
  loadRecentMatches();
  logEvent('App pronto. Inicie a partida, ligue a camera e valide a automacao.', { persist: false });
}

init();
