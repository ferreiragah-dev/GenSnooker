const state = {
  matchId: null,
  gameType: 'sinuca_brasileira',
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
  calibrationMode: false,
  calibrationPoints: [],
  manualTableQuad: null,
  pocketCalibrationMode: false,
  pocketCalibrationPoints: [],
  manualPockets: null,
  frameCounter: 0,
  tableQuad: null,
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
  gameType: document.querySelector('#game-type'),
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
  btnCalibrateTable: document.querySelector('#btn-calibrate-table'),
  btnClearCalibration: document.querySelector('#btn-clear-calibration'),
  btnCalibratePockets: document.querySelector('#btn-calibrate-pockets'),
  btnClearPockets: document.querySelector('#btn-clear-pockets'),
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
  gameLabel: document.querySelector('#game-label'),
  secureBanner: document.querySelector('#secure-banner'),
  opencvState: document.querySelector('#opencv-state'),
  calibrationState: document.querySelector('#calibration-state'),
  pocketCalibrationState: document.querySelector('#pocket-calibration-state'),
  tableState: document.querySelector('#table-state'),
  pocketsState: document.querySelector('#pockets-state'),
  detectedBalls: document.querySelector('#detected-balls'),
  autoReferee: document.querySelector('#auto-referee'),
  rulesTitle: document.querySelector('#rules-title'),
  rulesList: document.querySelector('#rules-list'),
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

const OPENCV_SOURCES = [
  'https://docs.opencv.org/4.10.0/opencv.js',
  'https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.10.0-release.1/opencv.js',
  'https://unpkg.com/@techstark/opencv-js@4.10.0-release.1/opencv.js',
];

const WARP_WIDTH = 960;
const WARP_HEIGHT = 480;
const TRACKING_CONFIG = {
  tableInset: 18,
  minRadiusPx: 4,
  maxRadiusPx: 18,
  minCircularity: 0.62,
  maxPerColor: 1,
  smoothingAlpha: 0.42,
};

const GAME_MODES = {
  sinuca_brasileira: {
    label: 'Sinuca Brasileira',
    targetPoints: 30,
    maxBall: 7,
    usesBallSequence: true,
    rulesTitle: 'Regras da sinuca brasileira (base)',
    rules: [
      'Partida com 2 jogadores, alternando a vez por jogada ou falta.',
      'Bolas pontuadas por valor de 1 a 7, em ordem da bola da vez.',
      'Encacapar a bola da vez soma seus pontos e mantem a vez.',
      'Falta comum concede 4 pontos ao adversario e troca a vez.',
      'Vence quem atingir ou ultrapassar a meta configurada.',
    ],
    pointsForPot: (currentBall) => currentBall,
  },
  bilhar: {
    label: 'Bilhar',
    targetPoints: 15,
    maxBall: 1,
    usesBallSequence: false,
    rulesTitle: 'Regras do bilhar (base)',
    rules: [
      'Partida por pontos em sequencia de tacadas.',
      'Cada sucesso registrado soma 1 ponto.',
      'Falta concede 1 ponto ao adversario e troca a vez.',
      'Nao usa bola da vez fixa neste modo simplificado.',
      'Vence quem atingir a meta de pontos.',
    ],
    pointsForPot: () => 1,
  },
  eight_ball: {
    label: '8 Ball',
    targetPoints: 8,
    maxBall: 8,
    usesBallSequence: true,
    rulesTitle: 'Regras 8 Ball (base simplificada)',
    rules: [
      'Partida em turno alternado com registro de bolas encaçapadas.',
      'Cada bola registrada soma 1 ponto.',
      'A bola 8 finaliza quando um jogador completa a meta.',
      'Falta concede 1 ponto ao adversario e troca a vez.',
      'Use este modo como assistente de placar/monitoramento.',
    ],
    pointsForPot: () => 1,
  },
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

function getGameMode(gameType = state.gameType) {
  return GAME_MODES[gameType] || GAME_MODES.sinuca_brasileira;
}

function renderRulesForGame(gameType = state.gameType) {
  const mode = getGameMode(gameType);
  refs.rulesTitle.textContent = mode.rulesTitle;
  refs.rulesList.innerHTML = '';
  for (const rule of mode.rules) {
    const li = document.createElement('li');
    li.textContent = rule;
    refs.rulesList.appendChild(li);
  }
}

function applyGameMode(gameType, options = {}) {
  const mode = getGameMode(gameType);
  state.gameType = gameType;
  state.maxBall = mode.maxBall;
  if (options.resetBall !== false) {
    state.currentBall = 1;
  }
  refs.gameLabel.textContent = mode.label;
  renderRulesForGame(gameType);
}

function getPotPoints() {
  const mode = getGameMode();
  return mode.pointsForPot(state.currentBall);
}

function getFoulPoints() {
  return state.gameType === 'sinuca_brasileira' ? 4 : 1;
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
  const mode = getGameMode();
  renderPlayerCard(0);
  renderPlayerCard(1);
  refs.gameLabel.textContent = mode.label;
  refs.turnLabel.textContent = state.players[state.currentPlayer] ?? '-';
  refs.ballLabel.textContent = mode.usesBallSequence ? String(state.currentBall) : '-';
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
  const mode = getGameMode();
  if (!mode.usesBallSequence) {
    return;
  }

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

async function createMatchOnServer(gameType, playerA, playerB, targetPoints) {
  const data = await apiFetch('/api/matches', {
    method: 'POST',
    body: JSON.stringify({ gameType, playerA, playerB, targetPoints }),
  });
  return data.match;
}

async function onStartMatch(event) {
  event.preventDefault();

  const selectedGameType = refs.gameType.value;
  const mode = getGameMode(selectedGameType);
  const a = refs.playerA.value.trim() || 'Jogador 1';
  const b = refs.playerB.value.trim() || 'Jogador 2';
  const target = clamp(Number(refs.targetPoints.value) || mode.targetPoints, 1, 999);

  try {
    const match = await createMatchOnServer(selectedGameType, a, b, target);
    setApiOnline(true);
    state.matchId = match.id;
    applyGameMode(selectedGameType);
    state.players = [a, b];
    state.scores = [0, 0];
    state.currentPlayer = 0;
    state.targetPoints = target;
    state.currentBall = 1;
    state.running = true;

    refs.scoreboard.classList.remove('hidden');
    renderScoreboard();
    logEvent(`Nova partida (${mode.label}): ${a} x ${b} (meta ${target} pts).`, { eventType: 'match_started', persist: false });
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
  const points = getPotPoints();
  addPoints(state.currentPlayer, points, `encacapou bola ${ballValue} (${source})`, source === 'opencv' ? 'opencv_pot' : 'pot');
  nextBall();
  renderScoreboard();
  persistMatchState();
}

function onFoul(source = 'manual') {
  if (!state.running) {
    return;
  }

  const rival = getOpponentIndex();
  const foulPoints = getFoulPoints();
  addPoints(rival, foulPoints, `falta do adversario (${source})`, source === 'opencv' ? 'opencv_foul' : 'foul');
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
      const mode = getGameMode(match.game_type);
      li.textContent = `#${match.id} [${mode.label}] ${match.player_a} ${match.score_a} x ${match.score_b} ${match.player_b} | ${match.status}${winner}`;
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
  state.calibrationMode = false;
  state.calibrationPoints = [];
  state.pocketCalibrationMode = false;
  state.pocketCalibrationPoints = [];
  state.tableQuad = null;
  state.manualTableQuad = null;
  state.manualPockets = null;
  state.pockets = [];
  state.trackedBalls = {};
  refs.motionState.textContent = 'Parado';
  refs.motionValue.textContent = '0.00%';
  refs.meterFill.style.width = '0%';
  refs.tableState.textContent = 'nao detectada';
  refs.calibrationState.textContent = 'automatica';
  refs.pocketCalibrationState.textContent = 'automatica';
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
  const kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(5, 5));
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  const roiMask = new cv.Mat.zeros(hsv.rows, hsv.cols, cv.CV_8UC1);
  const inset = TRACKING_CONFIG.tableInset;
  const roiWidth = Math.max(1, hsv.cols - (inset * 2));
  const roiHeight = Math.max(1, hsv.rows - (inset * 2));
  const roiRect = new cv.Rect(inset, inset, roiWidth, roiHeight);
  const roi = roiMask.roi(roiRect);
  roi.setTo(new cv.Scalar(255));
  roi.delete();

  try {
    cv.bitwise_and(mask, roiMask, mask);
    cv.morphologyEx(mask, mask, cv.MORPH_OPEN, kernel);
    cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, kernel);
    cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    const minArea = Math.PI * TRACKING_CONFIG.minRadiusPx * TRACKING_CONFIG.minRadiusPx;
    const maxArea = Math.PI * TRACKING_CONFIG.maxRadiusPx * TRACKING_CONFIG.maxRadiusPx;
    const found = [];
    for (let i = 0; i < contours.size(); i += 1) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);
      if (area < minArea || area > maxArea) {
        contour.delete();
        continue;
      }

      const perimeter = cv.arcLength(contour, true);
      if (!perimeter) {
        contour.delete();
        continue;
      }

      const circularity = (4 * Math.PI * area) / (perimeter * perimeter);
      if (circularity < TRACKING_CONFIG.minCircularity) {
        contour.delete();
        continue;
      }

      const moments = cv.moments(contour);
      if (!moments.m00) {
        contour.delete();
        continue;
      }

      const x = moments.m10 / moments.m00;
      const y = moments.m01 / moments.m00;
      const r = Math.sqrt(area / Math.PI);
      const score = circularity * area;
      found.push({
        x,
        y,
        r,
        score,
      });
      contour.delete();
    }

    mask.delete();
    roiMask.delete();
    kernel.delete();
    contours.delete();
    hierarchy.delete();
    return found
      .sort((a, b) => b.score - a.score)
      .slice(0, TRACKING_CONFIG.maxPerColor)
      .map(({ x, y, r }) => ({ x, y, r }));
  } catch (_error) {
    mask.delete();
    roiMask.delete();
    kernel.delete();
    contours.delete();
    hierarchy.delete();
    return [];
  }
}

function computePolygonArea(points) {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    area += (current.x * next.y) - (next.x * current.y);
  }
  return Math.abs(area / 2);
}

function orderQuadCorners(points) {
  const bySum = [...points].sort((a, b) => (a.x + a.y) - (b.x + b.y));
  const byDiff = [...points].sort((a, b) => (a.x - a.y) - (b.x - b.y));

  const topLeft = bySum[0];
  const bottomRight = bySum[bySum.length - 1];
  const bottomLeft = byDiff[0];
  const topRight = byDiff[byDiff.length - 1];

  return [topLeft, topRight, bottomRight, bottomLeft];
}

function extractQuadFromContour(contour) {
  const points = [];
  const raw = contour.data32S;
  for (let i = 0; i < raw.length; i += 2) {
    points.push({ x: raw[i], y: raw[i + 1] });
  }

  if (points.length < 4) {
    return null;
  }

  const quad = orderQuadCorners(points);
  const unique = new Set(quad.map((p) => `${p.x}:${p.y}`));
  if (unique.size < 4) {
    return null;
  }

  return quad;
}

function detectTableQuad(hsv) {
  const cv = window.cv;
  const mask = new cv.Mat();
  const lower = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), new cv.Scalar(35, 40, 30, 0));
  const upper = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), new cv.Scalar(95, 255, 255, 255));
  const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(11, 11));
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();

  cv.inRange(hsv, lower, upper, mask);
  cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, kernel);
  cv.morphologyEx(mask, mask, cv.MORPH_OPEN, kernel);
  cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

  let bestQuad = null;
  let bestArea = 0;
  const minArea = (hsv.cols * hsv.rows) * 0.12;

  for (let i = 0; i < contours.size(); i += 1) {
    const contour = contours.get(i);
    const area = cv.contourArea(contour);
    const quad = extractQuadFromContour(contour);
    contour.delete();

    if (!quad) {
      continue;
    }

    const quadArea = computePolygonArea(quad);
    if (area > bestArea && area > minArea && quadArea > minArea) {
      bestArea = area;
      bestQuad = quad;
    }
  }

  lower.delete();
  upper.delete();
  kernel.delete();
  contours.delete();
  hierarchy.delete();
  mask.delete();

  return bestQuad;
}

function buildWarpedPockets(width, height) {
  const r = Math.max(10, Math.round(Math.min(width, height) * 0.052));
  const inset = Math.round(r * 0.3);
  const left = inset;
  const right = width - inset;
  const top = inset;
  const bottom = height - inset;
  const mid = width / 2;

  return [
    { name: 'sup-esq', x: left, y: top, r },
    { name: 'sup-centro', x: mid, y: top, r },
    { name: 'sup-dir', x: right, y: top, r },
    { name: 'inf-esq', x: left, y: bottom, r },
    { name: 'inf-centro', x: mid, y: bottom, r },
    { name: 'inf-dir', x: right, y: bottom, r },
  ];
}

function computePerspectiveMatrices(tableQuad) {
  const cv = window.cv;
  const srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
    tableQuad[0].x, tableQuad[0].y,
    tableQuad[1].x, tableQuad[1].y,
    tableQuad[2].x, tableQuad[2].y,
    tableQuad[3].x, tableQuad[3].y,
  ]);
  const dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0, 0,
    WARP_WIDTH, 0,
    WARP_WIDTH, WARP_HEIGHT,
    0, WARP_HEIGHT,
  ]);

  const forward = cv.getPerspectiveTransform(srcPts, dstPts);
  const inverse = cv.getPerspectiveTransform(dstPts, srcPts);
  srcPts.delete();
  dstPts.delete();
  return { forward, inverse };
}

function projectPoint(matrix, x, y) {
  const m = matrix.data64F && matrix.data64F.length ? matrix.data64F : matrix.data32F;
  const den = (m[6] * x) + (m[7] * y) + m[8];
  if (!den || Number.isNaN(den)) {
    return { x: 0, y: 0 };
  }
  return {
    x: ((m[0] * x) + (m[1] * y) + m[2]) / den,
    y: ((m[3] * x) + (m[4] * y) + m[5]) / den,
  };
}

function mapCircleFromWarp(circle, inverseMatrix) {
  const center = projectPoint(inverseMatrix, circle.x, circle.y);
  const edge = projectPoint(inverseMatrix, circle.x + circle.r, circle.y);
  return {
    x: center.x,
    y: center.y,
    r: Math.max(2, Math.hypot(edge.x - center.x, edge.y - center.y)),
  };
}

function smoothTrackedBalls(nextTrackedBalls) {
  const alpha = TRACKING_CONFIG.smoothingAlpha;
  const smoothed = {};

  for (const key of Object.keys(BALL_PROFILES)) {
    const prev = state.trackedBalls[key] && state.trackedBalls[key][0];
    const curr = nextTrackedBalls[key] && nextTrackedBalls[key][0];

    if (prev && curr) {
      smoothed[key] = [{
        x: (prev.x * (1 - alpha)) + (curr.x * alpha),
        y: (prev.y * (1 - alpha)) + (curr.y * alpha),
        r: (prev.r * (1 - alpha)) + (curr.r * alpha),
      }];
    } else {
      smoothed[key] = curr ? [curr] : [];
    }
  }

  return smoothed;
}

function refreshCalibrationState() {
  if (state.calibrationMode) {
    refs.calibrationState.textContent = `capturando cantos (${state.calibrationPoints.length}/4)`;
  } else {
    refs.calibrationState.textContent = state.manualTableQuad ? 'manual' : 'automatica';
  }

  if (state.pocketCalibrationMode) {
    refs.pocketCalibrationState.textContent = `capturando (${state.pocketCalibrationPoints.length}/6)`;
  } else {
    refs.pocketCalibrationState.textContent = state.manualPockets ? 'manual' : 'automatica';
  }
}

function canvasClickToFramePoint(event, frameWidth, frameHeight) {
  const rect = refs.overlayCanvas.getBoundingClientRect();
  const xNorm = (event.clientX - rect.left) / rect.width;
  const yNorm = (event.clientY - rect.top) / rect.height;
  return {
    x: xNorm * frameWidth,
    y: yNorm * frameHeight,
  };
}

function onOverlayClick(event) {
  if ((!state.calibrationMode && !state.pocketCalibrationMode) || !state.stream) {
    return;
  }

  const frameWidth = 640;
  const frameHeight = 360;
  const point = canvasClickToFramePoint(event, frameWidth, frameHeight);
  if (state.calibrationMode) {
    state.calibrationPoints.push(point);

    if (state.calibrationPoints.length === 4) {
      state.manualTableQuad = orderQuadCorners(state.calibrationPoints);
      state.tableQuad = state.manualTableQuad;
      state.calibrationMode = false;
      state.calibrationPoints = [];
      logEvent('Calibracao manual da mesa concluida.', { eventType: 'table_calibrated' });
    }
  } else if (state.pocketCalibrationMode) {
    state.pocketCalibrationPoints.push(point);

    if (state.pocketCalibrationPoints.length === 6) {
      const baseRadius = Math.max(8, Math.round(Math.min(frameWidth, frameHeight) * 0.022));
      state.manualPockets = state.pocketCalibrationPoints.map((pocketPoint, idx) => ({
        name: `manual-${idx + 1}`,
        x: pocketPoint.x,
        y: pocketPoint.y,
        r: baseRadius,
      }));
      state.pocketCalibrationMode = false;
      state.pocketCalibrationPoints = [];
      logEvent('Calibracao manual de cacapas concluida.', { eventType: 'pockets_calibrated' });
    }
  }

  refreshCalibrationState();
}

function startManualCalibration() {
  if (!state.stream) {
    logEvent('Ligue a camera antes de calibrar a mesa.', { persist: false });
    return;
  }

  state.calibrationMode = true;
  state.calibrationPoints = [];
  state.manualTableQuad = null;
  state.pocketCalibrationMode = false;
  refreshCalibrationState();
  logEvent('Calibracao iniciada: clique nos 4 cantos internos da mesa (sup-esq, sup-dir, inf-dir, inf-esq).', {
    eventType: 'table_calibration_start',
  });
}

function startPocketCalibration() {
  if (!state.stream) {
    logEvent('Ligue a camera antes de calibrar as cacapas.', { persist: false });
    return;
  }

  state.pocketCalibrationMode = true;
  state.pocketCalibrationPoints = [];
  state.manualPockets = null;
  state.calibrationMode = false;
  refreshCalibrationState();
  logEvent('Calibracao de cacapas iniciada: clique nas 6 cacapas visiveis.', {
    eventType: 'pockets_calibration_start',
  });
}

function clearManualCalibration() {
  state.calibrationMode = false;
  state.calibrationPoints = [];
  state.manualTableQuad = null;
  refreshCalibrationState();
  logEvent('Calibracao manual removida. Voltando para deteccao automatica.', {
    eventType: 'table_calibration_cleared',
  });
}

function clearPocketCalibration() {
  state.pocketCalibrationMode = false;
  state.pocketCalibrationPoints = [];
  state.manualPockets = null;
  refreshCalibrationState();
  logEvent('Calibracao manual de cacapas removida.', {
    eventType: 'pockets_calibration_cleared',
  });
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

  if (state.tableQuad && state.tableQuad.length === 4) {
    overlayCtx.strokeStyle = 'rgba(96, 245, 180, 0.95)';
    overlayCtx.lineWidth = 2;
    overlayCtx.beginPath();
    state.tableQuad.forEach((corner, idx) => {
      const p = toOverlayPoint(corner, frameWidth, frameHeight);
      if (idx === 0) {
        overlayCtx.moveTo(p.x, p.y);
      } else {
        overlayCtx.lineTo(p.x, p.y);
      }
    });
    overlayCtx.closePath();
    overlayCtx.stroke();
  }

  if ((state.calibrationMode && state.calibrationPoints.length) || (state.pocketCalibrationMode && state.pocketCalibrationPoints.length)) {
    const drawPoints = state.calibrationMode ? state.calibrationPoints : state.pocketCalibrationPoints;
    for (const point of drawPoints) {
      const p = toOverlayPoint(point, frameWidth, frameHeight);
      overlayCtx.beginPath();
      overlayCtx.arc(p.x, p.y, 6, 0, Math.PI * 2);
      overlayCtx.fillStyle = 'rgba(255, 140, 140, 0.95)';
      overlayCtx.fill();
    }
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
  const width = 640;
  const height = 360;
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

  const tableQuad = state.manualTableQuad || detectTableQuad(hsv);
  state.tableQuad = tableQuad;
  refs.tableState.textContent = tableQuad ? 'detectada' : 'nao detectada';

  const trackedBalls = {};
  const seen = {};
  let projectedPockets = [];

  if (tableQuad) {
    const perspective = computePerspectiveMatrices(tableQuad);
    const warped = new cv.Mat();
    const warpedHsv = new cv.Mat();
    cv.warpPerspective(src, warped, perspective.forward, new cv.Size(WARP_WIDTH, WARP_HEIGHT), cv.INTER_LINEAR, cv.BORDER_REPLICATE, new cv.Scalar());
    cv.cvtColor(warped, warpedHsv, cv.COLOR_RGBA2RGB);
    cv.cvtColor(warpedHsv, warpedHsv, cv.COLOR_RGB2HSV);

    const warpedPockets = buildWarpedPockets(WARP_WIDTH, WARP_HEIGHT);
    projectedPockets = warpedPockets.map((pocket) => mapCircleFromWarp(pocket, perspective.inverse));

    for (const key of Object.keys(BALL_PROFILES)) {
      const circlesWarped = detectColorCircles(warpedHsv, BALL_PROFILES[key]);
      trackedBalls[key] = circlesWarped.map((circle) => mapCircleFromWarp(circle, perspective.inverse));
      seen[key] = circlesWarped.length > 0;
    }

    warped.delete();
    warpedHsv.delete();
    perspective.forward.delete();
    perspective.inverse.delete();
  } else {
    for (const key of Object.keys(BALL_PROFILES)) {
      trackedBalls[key] = [];
      seen[key] = false;
    }
  }

  if (state.manualPockets && state.manualPockets.length === 6) {
    projectedPockets = state.manualPockets;
  }

  const filteredTrackedBalls = smoothTrackedBalls(trackedBalls);
  state.pockets = projectedPockets;
  state.trackedBalls = filteredTrackedBalls;
  const nearPocketCount = countBallsNearPockets(filteredTrackedBalls, projectedPockets);
  refs.pocketsState.textContent = `${projectedPockets.length}/6 | bolas perto: ${nearPocketCount}`;

  src.delete();
  hsv.delete();
  refs.detectedBalls.textContent = summarizeTrackedBalls(filteredTrackedBalls);
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

function onGameTypeChange() {
  const gameType = refs.gameType.value;
  const mode = getGameMode(gameType);
  applyGameMode(gameType, { resetBall: !state.running });
  refs.targetPoints.value = String(mode.targetPoints);
  renderScoreboard();
}

function updateOpencvStateUi() {
  if (state.cvReady) {
    refs.opencvState.textContent = 'pronto';
    return;
  }

  refs.opencvState.textContent = 'carregando...';
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`falha_script:${src}`));
    document.head.appendChild(script);
  });
}

function waitForCvRuntime(timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const startedAt = performance.now();

    const checkReady = () => {
      if (window.cv && typeof window.cv.Mat === 'function') {
        resolve();
        return;
      }

      if (performance.now() - startedAt > timeoutMs) {
        reject(new Error('timeout_runtime_opencv'));
        return;
      }

      setTimeout(checkReady, 120);
    };

    if (window.cv && typeof window.cv.Mat === 'function') {
      resolve();
      return;
    }

    if (window.cv && typeof window.cv === 'object') {
      window.cv.onRuntimeInitialized = () => resolve();
    }

    checkReady();
  });
}

async function initOpenCv() {
  updateOpencvStateUi();

  if (window.cv && typeof window.cv.Mat === 'function') {
    state.cvReady = true;
    updateOpencvStateUi();
    return;
  }

  for (const src of OPENCV_SOURCES) {
    try {
      await loadScript(src);
      await waitForCvRuntime();
      state.cvReady = true;
      refs.opencvState.textContent = 'pronto';
      logEvent(`OpenCV carregado via ${new URL(src).hostname}.`, { eventType: 'opencv_ready' });
      return;
    } catch (_error) {
      refs.opencvState.textContent = 'carregando (fallback)...';
    }
  }

  state.cvReady = false;
  refs.opencvState.textContent = 'indisponivel';
  logEvent('OpenCV indisponivel: falha ao carregar bibliotecas de visao.', { persist: false });
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
  refs.btnCalibrateTable.addEventListener('click', startManualCalibration);
  refs.btnClearCalibration.addEventListener('click', clearManualCalibration);
  refs.btnCalibratePockets.addEventListener('click', startPocketCalibration);
  refs.btnClearPockets.addEventListener('click', clearPocketCalibration);
  refs.overlayCanvas.addEventListener('click', onOverlayClick);
  refs.threshold.addEventListener('input', onThresholdChange);
  refs.gameType.addEventListener('change', onGameTypeChange);
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
  applyGameMode(state.gameType);
  refs.gameType.value = state.gameType;
  refs.targetPoints.value = String(getGameMode().targetPoints);
  buildManualButtons();
  renderScoreboard();
  onThresholdChange();
  refreshCalibrationState();
  checkSecureContext();
  initOpenCv();
  loadRecentMatches();
  logEvent('App pronto. Inicie a partida, ligue a camera e valide a automacao.', { persist: false });
}

init();
