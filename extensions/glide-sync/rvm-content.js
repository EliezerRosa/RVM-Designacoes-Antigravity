/**
 * RVM Content Script
 * Injetado no site do RVM (localhost ou Vercel).
 * Escuta eventos do React (window.postMessage) e manda pro Background.
 */

window.addEventListener("message", (event) => {
    // Verificar a origem se necessário, mas como roda no próprio site, está seguro.
    if (event.source !== window) return;

    if (event.data.type && (event.data.type === "RVM_SYNC_GLIDE")) {
        console.log("[RVM Extensão] Mensagem recebida da UI:", event.data);
        
        chrome.runtime.sendMessage(
            { action: "START_GLIDE_SYNC", payload: event.data.payload },
            (response) => {
                // Repassar a resposta de volta pro React, se precisar mudar o botão pra "Concluído"
                window.postMessage({ type: "RVM_SYNC_GLIDE_RESPONSE", response: response }, "*");
            }
        );
    }
});

// Avisar a UI que a extensão está instalada e ativa
window.postMessage({ type: "RVM_EXTENSION_READY" }, "*");
