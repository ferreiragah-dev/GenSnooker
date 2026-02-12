import * as tf from 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/+esm';
import * as faceLandmarksDetection from 'https://cdn.jsdelivr.net/npm/@tensorflow-models/face-landmarks-detection@1.0.6/+esm';

const state = {
  detector: null,
  threshold: 0.72,
  descriptorA: null,
  descriptorB: null,
};

const refs = {
  fileA: document.querySelector('#file-a'),
  fileB: document.querySelector('#file-b'),
  canvasA: document.querySelector('#canvas-a'),
  canvasB: document.querySelector('#canvas-b'),
  statusA: document.querySelector('#status-a'),
  statusB: document.querySelector('#status-b'),
  threshold: document.querySelector('#threshold'),
  thresholdValue: document.querySelector('#threshold-value'),
  compareBtn: document.querySelector('#compare-btn'),
  modelState: document.querySelector('#model-state'),
  similarity: document.querySelector('#similarity'),
  distance: document.querySelector('#distance'),
  verdict: document.querySelector('#verdict'),
};

function setText(el, text, className = '') {
  el.textContent = text;
  el.className = className;
}

function cosineSimilarity(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  if (!denom) {
    return 0;
  }
  return dot / denom;
}

function euclideanDistance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

function normalizeVector(v) {
  let mag = 0;
  for (const x of v) {
    mag += x * x;
  }
  const m = Math.sqrt(mag) || 1;
  return v.map((x) => x / m);
}

function buildDescriptor(face) {
  const keypoints = face.keypoints;
  const leftEye = keypoints[33];
  const rightEye = keypoints[263];
  const nose = keypoints[1];

  if (!leftEye || !rightEye || !nose) {
    return null;
  }

  const eyeDist = Math.hypot(rightEye.x - leftEye.x, rightEye.y - leftEye.y);
  if (eyeDist < 8) {
    return null;
  }

  const cx = nose.x;
  const cy = nose.y;
  const out = [];

  for (const p of keypoints) {
    out.push((p.x - cx) / eyeDist);
    out.push((p.y - cy) / eyeDist);
    out.push((p.z || 0) / eyeDist);
  }

  return normalizeVector(out);
}

function drawFaces(canvas, image, faces, primaryIndex) {
  const ctx = canvas.getContext('2d');
  canvas.width = image.width;
  canvas.height = image.height;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0);

  if (!faces || !faces.length) {
    return;
  }

  for (let i = 0; i < faces.length; i += 1) {
    const face = faces[i];
    const box = face.box;
    const isPrimary = i === primaryIndex;

    ctx.strokeStyle = isPrimary ? '#f2b84b' : 'rgba(121, 223, 149, 0.8)';
    ctx.lineWidth = isPrimary ? 3 : 1.5;
    ctx.strokeRect(box.xMin, box.yMin, box.width, box.height);

    if (isPrimary) {
      ctx.fillStyle = 'rgba(121, 223, 149, 0.9)';
      for (const kp of face.keypoints) {
        ctx.beginPath();
        ctx.arc(kp.x, kp.y, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('falha_imagem'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('falha_leitura'));
    reader.readAsDataURL(file);
  });
}

async function detectFaces(image) {
  const faces = await state.detector.estimateFaces(image, { flipHorizontal: false });
  return faces || [];
}

function pickPrimaryFace(faces) {
  if (!faces.length) {
    return { face: null, index: -1 };
  }

  let bestIndex = 0;
  let bestArea = 0;
  for (let i = 0; i < faces.length; i += 1) {
    const box = faces[i].box;
    const area = box.width * box.height;
    if (area > bestArea) {
      bestArea = area;
      bestIndex = i;
    }
  }

  return { face: faces[bestIndex], index: bestIndex };
}

async function processInput(file, canvas, statusEl, slot) {
  if (!file) {
    return;
  }

  try {
    setText(statusEl, 'Processando rosto...', 'status warn');
    const image = await loadImageFromFile(file);
    const faces = await detectFaces(image);
    const { face, index } = pickPrimaryFace(faces);

    if (!face) {
      drawFaces(canvas, image, [], -1);
      if (slot === 'A') {
        state.descriptorA = null;
      } else {
        state.descriptorB = null;
      }
      setText(statusEl, 'Nenhum rosto detectado.', 'status bad');
      return;
    }

    const descriptor = buildDescriptor(face);
    if (!descriptor) {
      drawFaces(canvas, image, faces, index);
      if (slot === 'A') {
        state.descriptorA = null;
      } else {
        state.descriptorB = null;
      }
      setText(statusEl, 'Rosto invalido para comparacao.', 'status bad');
      return;
    }

    drawFaces(canvas, image, faces, index);

    if (slot === 'A') {
      state.descriptorA = descriptor;
    } else {
      state.descriptorB = descriptor;
    }

    if (faces.length > 1) {
      setText(statusEl, `Multiplos rostos detectados (${faces.length}). Usando o maior rosto.`, 'status warn');
    } else {
      setText(statusEl, 'Rosto detectado com sucesso.', 'status ok');
    }
  } catch (_error) {
    if (slot === 'A') {
      state.descriptorA = null;
    } else {
      state.descriptorB = null;
    }
    setText(statusEl, 'Falha ao processar imagem.', 'status bad');
  }
}

function compareFaces() {
  if (!state.descriptorA || !state.descriptorB) {
    setText(refs.verdict, 'Carregue duas imagens validas.', 'bad');
    refs.similarity.textContent = '-';
    refs.distance.textContent = '-';
    return;
  }

  const sim = cosineSimilarity(state.descriptorA, state.descriptorB);
  const dist = euclideanDistance(state.descriptorA, state.descriptorB);
  const pass = sim >= state.threshold;

  refs.similarity.textContent = `${(sim * 100).toFixed(2)}%`;
  refs.distance.textContent = dist.toFixed(4);

  if (pass) {
    setText(refs.verdict, 'Rostos semelhantes', 'ok');
  } else {
    setText(refs.verdict, 'Rostos diferentes', 'bad');
  }
}

async function initModel() {
  setText(refs.modelState, 'Carregando modelo de rosto...', 'warn');

  await tf.setBackend('webgl');
  await tf.ready();

  const model = faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh;
  state.detector = await faceLandmarksDetection.createDetector(model, {
    runtime: 'tfjs',
    refineLandmarks: true,
    maxFaces: 5,
  });

  setText(refs.modelState, 'Modelo pronto', 'ok');
}

function bindEvents() {
  refs.fileA.addEventListener('change', async (event) => {
    const [file] = event.target.files || [];
    await processInput(file, refs.canvasA, refs.statusA, 'A');
  });

  refs.fileB.addEventListener('change', async (event) => {
    const [file] = event.target.files || [];
    await processInput(file, refs.canvasB, refs.statusB, 'B');
  });

  refs.threshold.addEventListener('input', (event) => {
    state.threshold = Number(event.target.value);
    refs.thresholdValue.textContent = state.threshold.toFixed(2);
  });

  refs.compareBtn.addEventListener('click', compareFaces);
}

async function init() {
  bindEvents();
  try {
    await initModel();
  } catch (_error) {
    setText(refs.modelState, 'Falha ao carregar modelo', 'bad');
  }
}

init();
