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

function findAllElements(selector, root = document) {
    let elements = Array.from(root.querySelectorAll(selector));
    const allNodes = Array.from(root.querySelectorAll('*'));
    for (const el of allNodes) {
        if (el.shadowRoot) {
            elements = elements.concat(findAllElements(selector, el.shadowRoot));
        }
    }
    return elements;
}

async function waitForInputs(expectedCount, maxWaitMs = 45000) {
    console.log(`[Glide Sync] Aguardando a tela do Glide montar os ${expectedCount} campos de imagem...`);
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
        const inputs = findAllElements('input[type="file"]');
        if (inputs.length > 0) {
            console.log(`[Glide Sync] Uhuu! O Glide terminou de renderizar a tela. Achei ${inputs.length} inputs.`);
            return inputs;
        }
        await delay(1000); // Tenta de novo a cada 1 segundo
    }
    return findAllElements('input[type="file"]');
}

async function injectImages(images) {
    console.log(`[Glide Sync] Recebidas ${images.length} imagens para injetar.`);
    
    // Procura todos os inputs do tipo arquivo, ESPERANDO o React do Glide carregar
    const fileInputs = await waitForInputs(images.length);

    if (fileInputs.length === 0) {
        throw new Error(`Não achei os botões "Choose an image" no Glide mesmo após 45 segundos aguardando. A tela não carregou ou o layout mudou.`);
    }

    if (fileInputs.length < images.length) {
        console.warn(`[Glide Sync] Achei apenas ${fileInputs.length} espaços para imagem, mas preciso de ${images.length}. Vou injetar nos que encontrei!`);
    }

    for (let i = 0; i < images.length; i++) {
        const fileObj = base64ToFile(images[i].base64, images[i].filename);
        
        // 1. Procurar botão de X (Excluir Imagem Antiga)
        const clearButtons = findAllElements('[aria-label="Clear value"], [aria-label="Remove image"]');
        if (clearButtons.length > i) {
            console.log(`[Glide Sync] Clicando no X da semana ${i + 1}`);
            clearButtons[i].click();
            await delay(500);
            
            // Aceitar modal de Delete
            const buttons = findAllElements('button');
            const deleteBtn = buttons.find(b => b.innerText && (b.innerText.includes('Delete') || b.innerText.includes('Excluir')));
            if (deleteBtn) {
                deleteBtn.click();
                await delay(1500);
            }
        }

        // 2. Injetar arquivo no Input
        console.log(`[Glide Sync] Injetando arquivo na semana ${i + 1}`);
        const input = fileInputs[i];
        
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(fileObj);
        input.files = dataTransfer.files;
        
        // Disparar eventos pro React do Glide perceber que o arquivo mudou
        const changeEvent = new Event('change', { bubbles: true });
        // Hack para forçar o React a ver a mudança
        Object.defineProperty(changeEvent, 'target', { writable: false, value: input });
        input.dispatchEvent(changeEvent);
        
        const inputEvent = new Event('input', { bubbles: true });
        input.dispatchEvent(inputEvent);
        
        // Aguardar upload do Glide
        await delay(5000); 
    }
}
