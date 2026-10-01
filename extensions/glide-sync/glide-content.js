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

async function injectImages(images) {
    for (let i = 0; i < images.length; i++) {
        const fileObj = base64ToFile(images[i].base64, images[i].filename);
        
        // 1. Procurar botão de X (Excluir Imagem Antiga)
        // O Glide usa aria-label="Clear value" ou "Remove image"
        const clearButtons = document.querySelectorAll('[aria-label="Clear value"], [aria-label="Remove image"]');
        
        if (clearButtons.length > i) {
            console.log(`[Glide Sync] Clicando no X da semana ${i + 1}`);
            clearButtons[i].click();
            await delay(500);
            
            // Aceitar modal de Delete
            // Busca botão contendo "Delete"
            const buttons = Array.from(document.querySelectorAll('button'));
            const deleteBtn = buttons.find(b => b.innerText.includes('Delete'));
            if (deleteBtn) {
                deleteBtn.click();
                await delay(1500); // Dar tempo do Glide processar a deleção
            }
        }

        // 2. Procurar Input de Arquivo
        const fileInputs = document.querySelectorAll('input[type="file"]');
        
        if (fileInputs.length > i) {
            console.log(`[Glide Sync] Injetando arquivo na semana ${i + 1}`);
            
            // Criar um DataTransfer falso pra colocar o arquivo no Input
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(fileObj);
            
            const input = fileInputs[i];
            input.files = dataTransfer.files;
            
            // Disparar eventos pro React do Glide perceber que o arquivo mudou
            input.dispatchEvent(new Event('change', { bubbles: true }));
            
            // Aguardar upload do Glide (muito importante)
            await delay(4000); 
        } else {
            console.warn(`[Glide Sync] Input ${i} não encontrado!`);
        }
    }
}
