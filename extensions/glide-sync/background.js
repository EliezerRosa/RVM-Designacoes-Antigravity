/**
 * Background Service Worker
 * Orquestra as abas. Recebe imagens do RVM e manda pro Glide.
 */

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "START_GLIDE_SYNC") {
        console.log("[RVM Background] Iniciando sincronização Glide...");
        
        const glideUrl = "https://relatorio-mensal-v03-new.glide.page/dl/e9d33b";

        // Procura se já tem uma aba do Glide aberta
        chrome.tabs.query({ url: "https://relatorio-mensal-v03-new.glide.page/*" }, (tabs) => {
            let glideTabId = null;

            if (tabs.length > 0) {
                // Usa a aba existente e traz para frente
                glideTabId = tabs[0].id;
                chrome.tabs.update(glideTabId, { active: true });
                
                console.log("[RVM Background] Aba encontrada. Forçando Ctrl+F5 (bypassCache)...");
                chrome.tabs.reload(glideTabId, { bypassCache: true }, () => {
                    // Escutar quando o reload terminar
                    chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
                        if (tabId === glideTabId && info.status === 'complete') {
                            chrome.tabs.onUpdated.removeListener(listener);
                            console.log("[RVM Background] Reload concluído. Aguardando hidratação...");
                            // Dar 3 segundos pro React do Glide hidratar
                            setTimeout(() => {
                                sendImagesToGlide(glideTabId, request.payload, sendResponse);
                            }, 3000);
                        }
                    });
                });
            } else {
                // Abre uma nova aba (trazendo-a para frente)
                chrome.tabs.create({ url: glideUrl, active: true }, (newTab) => {
                    glideTabId = newTab.id;
                    
                    // Como a aba acabou de ser criada, o glide-content.js ainda não carregou.
                    // Precisamos escutar quando a aba terminar de carregar
                    chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
                        if (tabId === glideTabId && info.status === 'complete') {
                            chrome.tabs.onUpdated.removeListener(listener);
                            // Dar 2 segundos pro React do Glide hidratar
                            setTimeout(() => {
                                sendImagesToGlide(glideTabId, request.payload, sendResponse);
                            }, 3000);
                        }
                    });
                });
            }
        });
        
        return true; // Mantém a porta de mensagem aberta para resposta assíncrona
    }
});

function sendImagesToGlide(tabId, images, sendResponse) {
    chrome.tabs.sendMessage(
        tabId,
        { action: "INJECT_IMAGES", images: images },
        (response) => {
            console.log("[RVM Background] Resposta do Glide:", response);
            if (sendResponse) sendResponse(response);
            
            // Opcional: fechar a aba do glide após sucesso
            // se o usuário quiser que seja 100% silencioso
            // se deu tudo certo: chrome.tabs.remove(tabId);
        }
    );
}
