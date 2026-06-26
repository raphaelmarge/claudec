/* ============================================================
   ACADEMIA — módulo de reconhecimento facial
   Wrapper sobre o face-api.js (fork @vladmandic), carregado via CDN.
   Captura um "descritor" facial (128 floats) no cadastro e, no
   check-in, compara a leitura da webcam com os alunos cadastrados.
   Tudo roda no navegador — nenhuma imagem sai do dispositivo.
   ============================================================ */
window.AcadFace = (function () {
  'use strict';

  const CDN_SCRIPT = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/dist/face-api.js';
  const CDN_MODELS = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/model';

  let faceapi = null;        // referência à lib
  let modelsLoaded = false;
  let loadingPromise = null;
  let stream = null;         // MediaStream da webcam ativa

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (window.faceapi) { resolve(window.faceapi); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => resolve(window.faceapi);
      s.onerror = () => reject(new Error('Não foi possível carregar a biblioteca de reconhecimento facial (sem internet?).'));
      document.head.appendChild(s);
    });
  }

  /* Carrega lib + modelos (uma única vez). Pode ser chamado várias vezes. */
  async function ensureReady() {
    if (modelsLoaded) return true;
    if (loadingPromise) return loadingPromise;
    loadingPromise = (async () => {
      faceapi = await loadScript(CDN_SCRIPT);
      if (!faceapi) throw new Error('Biblioteca facial indisponível.');
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(CDN_MODELS),
        faceapi.nets.faceLandmark68Net.loadFromUri(CDN_MODELS),
        faceapi.nets.faceRecognitionNet.loadFromUri(CDN_MODELS)
      ]);
      modelsLoaded = true;
      return true;
    })();
    try { return await loadingPromise; }
    catch (e) { loadingPromise = null; throw e; }
  }

  function supported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  /* Liga a webcam num elemento <video>. */
  async function startCamera(videoEl) {
    if (!supported()) throw new Error('Este dispositivo/navegador não dá acesso à câmera.');
    stopCamera();
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false
    });
    videoEl.srcObject = stream;
    await videoEl.play().catch(() => {});
    return stream;
  }

  function stopCamera() {
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  }

  /* Detecta UM rosto no vídeo e devolve o descritor (Array de 128 números) ou null. */
  async function captureDescriptor(videoEl) {
    await ensureReady();
    const opts = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.4 });
    const det = await faceapi
      .detectSingleFace(videoEl, opts)
      .withFaceLandmarks()
      .withFaceDescriptor();
    if (!det) return null;
    return Array.from(det.descriptor);
  }

  /* Distância euclidiana entre dois descritores. */
  function distance(a, b) {
    if (!a || !b || a.length !== b.length) return Infinity;
    let s = 0;
    for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
    return Math.sqrt(s);
  }

  /* Compara um descritor contra uma lista [{id, descriptor}] e devolve
     { id, dist } do melhor match dentro do threshold, ou null. */
  function bestMatch(descriptor, candidates, threshold) {
    let best = null;
    for (const c of candidates) {
      if (!c.descriptor || !c.descriptor.length) continue;
      const d = distance(descriptor, c.descriptor);
      if (best === null || d < best.dist) best = { id: c.id, dist: d };
    }
    if (best && best.dist <= threshold) return best;
    return null;
  }

  return {
    ensureReady, supported, startCamera, stopCamera,
    captureDescriptor, distance, bestMatch,
    get modelsLoaded() { return modelsLoaded; }
  };
})();
