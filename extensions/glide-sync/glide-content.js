/**
 * Glide Content Script
 * Roda dentro da página do Glide. Recebe as imagens Base64 e injeta no DOM.
 */

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "INJECT_IMAGES") {
        console.log("[Glide Sync] Iniciando injeção de imagens...", request.images);
        
        injectImages(request.images)
            .then(() => sendResponse({ success: true, message: "Sincronização concluída!" }))
            .catch(err => sendResponse({ success: false, error: err.message }));

        return true; // async
    }
});

// Transforma Base64 em um File Object do Javascript
function base64ToFile(base64, filename) {
    const arr = base64.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    
    while(n--){
        u8arr[n] = bstr.charCodeAt(n);
    }
    
    return new File([u8arr], filename, {type: mime});
}

// Simulador de Delay
const delay = (ms) => new Promise(res => setTimeout(res, ms));

async function waitForInputs(expectedCount, maxWaitMs = 30000) {
    console.log(`[Glide Sync] Aguardando o Glide carregar os campos de imagem...`);
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
        const fileInputs = document.querySelectorAll('input[type="file"]');
        if (fileInputs.length >= expectedCount) {
            console.log(`[Glide Sync] Inputs carregados! Encontrados: ${fileInputs.length}`);
            return fileInputs;
        }
        await delay(1000);
    }
    return document.querySelectorAll('input[type="file"]');
}

async function injectImages(images) {
    console.log(`[Glide Sync] Recebidas ${images.length} imagens para injetar.`);
    
    // Aguarda o Glide montar a tela após o Ctrl+F5
    const fileInputs = await waitForInputs(images.length);

    if (fileInputs.length === 0) {
        throw new Error(`Não achei os botões "Choose an image" no Glide. A tela demorou muito para carregar ou o Glide mudou o layout.`);
    }

    for (let i = 0; i < images.length; i++) {
        const fileObj = base64ToFile(images[i].base64, images[i].filename);
        
        // 1. Procurar botão de X (Excluir Imagem Antiga)
        const clearButtons = document.querySelectorAll('[aria-label="Clear value"], [aria-label="Remove image"]');
        
        if (clearButtons.length > i) {
            console.log(`[Glide Sync] Clicando no X da semana ${i + 1}`);
            clearButtons[i].click();
            await delay(500);
            
            // Aceitar modal de Delete
            const buttons = Array.from(document.querySelectorAll('button'));
            const deleteBtn = buttons.find(b => b.innerText.includes('Delete'));
            if (deleteBtn) {
                deleteBtn.click();
                await delay(1500);
            }
        }

        // 2. Procurar Input de Arquivo
        const currentInputs = document.querySelectorAll('input[type="file"]');
        
        if (currentInputs.length > i) {
            console.log(`[Glide Sync] Injetando arquivo na semana ${i + 1}`);
            
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(fileObj);
            
            const input = currentInputs[i];
            input.files = dataTransfer.files;
            
            input.dispatchEvent(new Event('change', { bubbles: true }));
            
            // Aguardar upload do Glide (muito importante)
            await delay(4000); 
        } else {
            console.warn(`[Glide Sync] Input ${i} não encontrado!`);
        }
    }
}
