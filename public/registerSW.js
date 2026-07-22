if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then((reg) => {
        console.log('[Service Worker] Registrado com sucesso:', reg.scope);
      })
      .catch((err) => {
        console.warn('[Service Worker] Falha no registro:', err);
      });
  });
}
