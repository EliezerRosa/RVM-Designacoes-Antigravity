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
                
                console.log("[RVM Background] Aba encontrada. Navegando para a tela correta e forçando reload...");
                // Navega para a URL exata (deep link) para garantir que está na tela certa
                chrome.tabs.update(glideTabId, { active: true, url: glideUrl }, () => {
                    let injected = false;
                    const inject = () => {
                        if (injected) return;
                        injected = true;
                        console.log("[RVM Background] Injetando imagens...");
                        setTimeout(() => sendImagesToGlide(glideTabId, request.payload, sendResponse), 3000);
                    };

                    chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
                        if (tabId === glideTabId && info.status === 'complete') {
                            chrome.tabs.onUpdated.removeListener(listener);
                            inject();
                        }
                    });
                    
                    // Fallback: se o Glide demorar demais para reportar 'complete', injeta mesmo assim após 15s
                    setTimeout(() => {
                        if (!injected) {
                            console.warn("[RVM Background] Fallback: Aba não reportou 'complete' após 15s. Tentando injetar mesmo assim...");
                            inject();
                        }
                    }, 15000);
                });
            } else {
                // Abre uma nova aba (trazendo-a para frente)
                chrome.tabs.create({ url: glideUrl, active: true }, (newTab) => {
                    glideTabId = newTab.id;
                    
                    let injected = false;
                    const inject = () => {
                        if (injected) return;
                        injected = true;
                        console.log("[RVM Background] Injetando imagens...");
                        setTimeout(() => sendImagesToGlide(glideTabId, request.payload, sendResponse), 3000);
                    };

                    chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
                        if (tabId === glideTabId && info.status === 'complete') {
                            chrome.tabs.onUpdated.removeListener(listener);
                            inject();
                        }
                    });

                    // Fallback
                    setTimeout(() => {
                        if (!injected) {
                            console.warn("[RVM Background] Fallback: Aba não reportou 'complete' após 15s. Tentando injetar mesmo assim...");
                            inject();
                        }
                    }, 15000);
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
