const state = {
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
  video: document.querySelector('#video'),
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
};

const ctx = refs.canvas.getContext('2d', { willReadFrequently: true });

function timestamp() {
  return new Date().toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function logEvent(text) {
  const item = document.createElement('li');
  item.textContent = `[${timestamp()}] ${text}`;
  refs.eventLog.prepend(item);

  while (refs.eventLog.children.length > 120) {
    refs.eventLog.removeChild(refs.eventLog.lastChild);
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
  logEvent(`Fim de partida: ${state.players[winnerIdx]} venceu.`);
}

function checkWinner() {
  if (state.scores[0] >= state.targetPoints || state.scores[1] >= state.targetPoints) {
    const winner = state.scores[0] >= state.targetPoints ? 0 : 1;
    finishMatch(winner);
  }
}

function addPoints(playerIndex, points, reason) {
  if (!state.running) {
    return;
  }

  state.scores[playerIndex] += points;
  logEvent(`${state.players[playerIndex]} +${points} (${reason})`);
  renderScoreboard();
  checkWinner();
}

function renderPlayerCard(index) {
  const card = refs[`p${index}`];
  card.classList.toggle('active', state.currentPlayer === index && state.running);
  card.innerHTML = `
    <h3>${state.players[index]}</h3>
    <p>${state.scores[index]} pts</p>
  `;
}

function renderScoreboard() {
  renderPlayerCard(0);
  renderPlayerCard(1);
  refs.turnLabel.textContent = state.players[state.currentPlayer] ?? '-';
  refs.ballLabel.textContent = String(state.currentBall);

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
    logEvent('Sequencia de bolas reiniciada para 1.');
  }
}

function buildManualButtons() {
  for (let points = 1; points <= 7; points += 1) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = `+${points}`;
    btn.addEventListener('click', () => {
      addPoints(state.currentPlayer, points, 'ajuste manual');
    });
    refs.manualButtons.appendChild(btn);
  }
}

function onStartMatch(event) {
  event.preventDefault();

  const a = refs.playerA.value.trim() || 'Jogador 1';
  const b = refs.playerB.value.trim() || 'Jogador 2';
  const target = clamp(Number(refs.targetPoints.value) || 30, 1, 999);

  state.players = [a, b];
  state.scores = [0, 0];
  state.currentPlayer = 0;
  state.targetPoints = target;
  state.currentBall = 1;
  state.running = true;

  refs.scoreboard.classList.remove('hidden');
  renderScoreboard();
  logEvent(`Nova partida: ${a} x ${b} (meta ${target} pts).`);
}

function onPotBall() {
  if (!state.running) {
    return;
  }

  const ballValue = state.currentBall;
  addPoints(state.currentPlayer, ballValue, `encacapou bola ${ballValue}`);
  nextBall();
  renderScoreboard();
}

function onFoul() {
  if (!state.running) {
    return;
  }

  const rival = getOpponentIndex();
  addPoints(rival, 4, 'falta do adversario');
  switchTurn();
  renderScoreboard();
}

function onTurnChange() {
  if (!state.running) {
    return;
  }

  switchTurn();
  renderScoreboard();
  logEvent(`Troca de vez. Agora: ${state.players[state.currentPlayer]}.`);
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
    logEvent('Camera ligada com sucesso.');

    state.prevGray = null;
    if (state.rafId) {
      cancelAnimationFrame(state.rafId);
    }
    monitorMotion();
  } catch (err) {
    console.error(err);
    logEvent('Falha ao ligar camera. Verifique permissoes do navegador.');
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
  refs.motionState.textContent = 'Parado';
  refs.motionValue.textContent = '0.00%';
  refs.meterFill.style.width = '0%';
  logEvent('Camera desligada.');
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
          logEvent('Movimento iniciado na mesa.');
        }

        state.lastMovementAt = now;

        if (now - state.lastMotionEventAt > 1300) {
          state.lastMotionEventAt = now;
          logEvent(`Evento de movimento (${motionPercent.toFixed(1)}%).`);
        }
      } else {
        if (state.moving && now - state.lastMovementAt > 650) {
          state.moving = false;
          refs.motionState.textContent = 'Parado';
          logEvent('Mesa estabilizada.');
        }

        if (!state.moving) {
          refs.motionState.textContent = 'Parado';
        }
      }
    }

    state.prevGray = gray;
    state.rafId = requestAnimationFrame(loop);
  };

  state.rafId = requestAnimationFrame(loop);
}

function onThresholdChange() {
  state.motionThreshold = Number(refs.threshold.value);
  refs.thresholdValue.textContent = `${state.motionThreshold}%`;
}

function bindEvents() {
  refs.form.addEventListener('submit', onStartMatch);
  refs.btnPot.addEventListener('click', onPotBall);
  refs.btnTurn.addEventListener('click', onTurnChange);
  refs.btnFoul.addEventListener('click', onFoul);
  refs.btnCamera.addEventListener('click', startCamera);
  refs.btnStopCamera.addEventListener('click', stopCamera);
  refs.threshold.addEventListener('input', onThresholdChange);

  window.addEventListener('beforeunload', () => {
    stopCamera();
  });
}

function init() {
  bindEvents();
  buildManualButtons();
  renderScoreboard();
  onThresholdChange();
  logEvent('App pronto. Inicie a partida e ligue a camera.');
}

init();
