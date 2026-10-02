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

function getDropZones() {
    const allNodes = findAllElements('*');
    // Encontra elementos que contêm o texto "Choose an image"
    const zones = allNodes.filter(el => {
        if (!el.innerText) return false;
        if (el.children.length > 3) return false; // Evita pegar o body inteiro
        return el.innerText.includes('Choose an image') || el.innerText.includes('Escolha uma imagem');
    });
    // Pega os 4 últimos (ou mais específicos)
    return zones.slice(-4);
}

async function waitForInputs(expectedCount, maxWaitMs = 25000) {
    console.log(`[Glide Sync] Aguardando a tela do Glide montar os campos de imagem...`);
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
        const inputs = findAllElements('input[type="file"]');
        if (inputs.length > 0) {
            console.log(`[Glide Sync] Achei ${inputs.length} inputs <input type="file">!`);
            return { type: 'input', elements: inputs };
        }
        
        const dropZones = getDropZones();
        if (dropZones.length >= expectedCount) {
            console.log(`[Glide Sync] Achei ${dropZones.length} DropZones (caixas visíveis)!`);
            return { type: 'dropzone', elements: dropZones };
        }

        await delay(1000);
    }
    
    // Tenta retornar o que tiver
    const inputs = findAllElements('input[type="file"]');
    if (inputs.length > 0) return { type: 'input', elements: inputs };
    return { type: 'dropzone', elements: getDropZones() };
}

async function injectImages(images) {
    console.log(`[Glide Sync] Recebidas ${images.length} imagens para injetar.`);
    
    // Procura todos os inputs do tipo arquivo ou Dropzones
    const target = await waitForInputs(images.length);
    const targetElements = target.elements;

    if (targetElements.length === 0) {
        throw new Error(`Não achei os botões "Choose an image" no Glide mesmo após aguardar. A tela não carregou ou o layout mudou.`);
    }

    if (targetElements.length < images.length) {
        console.warn(`[Glide Sync] Achei apenas ${targetElements.length} espaços para imagem, mas preciso de ${images.length}. Vou injetar nos que encontrei!`);
    }

    for (let i = 0; i < images.length; i++) {
        if (!targetElements[i]) break;

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

        // 2. Injetar arquivo
        console.log(`[Glide Sync] Injetando arquivo na semana ${i + 1} via ${target.type}`);
        const el = targetElements[i];
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(fileObj);
        
        if (target.type === 'input') {
            el.files = dataTransfer.files;
            
            const changeEvent = new Event('change', { bubbles: true });
            Object.defineProperty(changeEvent, 'target', { writable: false, value: el });
            el.dispatchEvent(changeEvent);
            
            const inputEvent = new Event('input', { bubbles: true });
            el.dispatchEvent(inputEvent);
        } else {
            // É um DropZone (div genérica)
            // Simular drag and drop completo para o React Dropzone
            const dragEnter = new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer });
            el.dispatchEvent(dragEnter);
            
            const dragOver = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer });
            el.dispatchEvent(dragOver);
            
            const dropEvent = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer });
            el.dispatchEvent(dropEvent);
        }
        
        // Aguardar upload do Glide
        await delay(5000); 
    }
}
