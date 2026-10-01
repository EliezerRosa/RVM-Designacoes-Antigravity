import { chromium } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';

const extensionPath = path.join(process.cwd(), 'extensions', 'glide-sync');

async function testExtension() {
    console.log('🚀 Iniciando servidor de testes local (Vite)...');
    
    // Inicia o Vite no background
    const viteProcess = spawn('npx', ['vite', '--port', '5174', '--strictPort'], {
        stdio: 'pipe',
        shell: true
    });

    // Esperar o Vite subir
    await new Promise((resolve) => setTimeout(resolve, 3000));

    console.log('✅ Vite rodando. Iniciando Chrome com a Extensão RVM Sync injetada...');

    // Lança um Chrome Context persistente (necessário para carregar extensões no Playwright)
    const userDataDir = path.join(process.cwd(), 'test-user-data');
    if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir);

    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: false, // Extensões MV3 requerem headed mode no Playwright
        args: [
            `--disable-extensions-except=${extensionPath}`,
            `--load-extension=${extensionPath}`
        ]
    });

    try {
        const page = await context.newPage();
        
        console.log('🌐 Navegando para http://localhost:5174...');
        await page.goto('http://localhost:5174');

        // Aguarda a aplicação carregar
        await page.waitForTimeout(2000);

        // Simulando a navegação ou abertura do modal do S-140
        // Como não sabemos o estado inicial exato, vamos injetar um evento manual de teste
        // para checar se a comunicação RVM <-> Extensão está viva
        
        console.log('📡 Testando comunicação com a extensão (Ping)...');
        
        const isExtensionReady = await page.evaluate(`
            new Promise((resolve) => {
                const listener = (event) => {
                    if (event.data.type === 'RVM_EXTENSION_READY') {
                        window.removeEventListener('message', listener);
                        resolve(true);
                    }
                };
                window.addEventListener('message', listener);
                window.postMessage({ type: 'PING_EXTENSION' }, '*');
                setTimeout(() => resolve(false), 2000);
            })
        `);

        if (isExtensionReady) {
            console.log('✅ SUCESSO: O React recebeu o sinal (RVM_EXTENSION_READY) da extensão RVM Sync!');
            console.log('✅ O botão "✨ Sync Glide (Invisível)" vai aparecer na interface para o Admin.');
        } else {
            console.log('❌ FALHA: A extensão não respondeu ao React.');
        }

    } catch (err) {
        console.error('❌ Erro no teste E2E:', err);
    } finally {
        console.log('🛑 Fechando navegador e servidor...');
        await context.close();
        viteProcess.kill();
        if (fs.existsSync(userDataDir)) fs.rmSync(userDataDir, { recursive: true, force: true });
    }
}

testExtension();
