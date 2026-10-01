import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import AdmZip from 'adm-zip';

const GLIDE_URL = 'https://relatorio-mensal-v03-new.glide.page/dl/e9d33b';
const AUTH_FILE = path.join(__dirname, '.auth-glide.json');
const DOWNLOADS_DIR = path.join(os.homedir(), 'Downloads');

async function findLatestZip() {
    const files = fs.readdirSync(DOWNLOADS_DIR);
    const glideZips = files
        .filter(f => f.startsWith('Glide_S140_Export_') && f.endsWith('.zip'))
        .map(f => ({ name: f, time: fs.statSync(path.join(DOWNLOADS_DIR, f)).mtime.getTime() }))
        .sort((a, b) => b.time - a.time);

    if (glideZips.length === 0) return null;
    return path.join(DOWNLOADS_DIR, glideZips[0].name);
}

async function run() {
    console.log('🤖 Iniciando Robô de Sincronização do Glide (Modo RPA)');
    
    // 1. Localizar e descompactar o último ZIP exportado
    const latestZipPath = await findLatestZip();
    if (!latestZipPath) {
        console.error('❌ Erro: Nenhum arquivo ZIP "Glide_S140_Export_..." encontrado na pasta Downloads.');
        console.log('👉 Vá na interface web, clique em "Exportar Glide (ZIP)" e tente rodar novamente.');
        process.exit(1);
    }
    
    console.log(`📦 Encontrado arquivo ZIP: ${path.basename(latestZipPath)}`);
    const extractDir = path.join(os.tmpdir(), 'glide-s140-export');
    
    if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true });
    fs.mkdirSync(extractDir);
    
    // Use adm-zip (precisa instalar: npm i adm-zip @types/adm-zip)
    try {
        const zip = new AdmZip(latestZipPath);
        zip.extractAllTo(extractDir, true);
        console.log(`📂 Arquivos descompactados em: ${extractDir}`);
    } catch (err) {
        console.error('❌ Erro ao descompactar o ZIP. Certifique-se de instalar o adm-zip: npm i adm-zip');
        process.exit(1);
    }

    const images = fs.readdirSync(extractDir).filter(f => f.endsWith('.png')).sort();
    if (images.length === 0) {
        console.error('❌ Nenhuma imagem PNG encontrada dentro do ZIP.');
        process.exit(1);
    }
    console.log(`🖼️  Encontradas ${images.length} imagens: \n` + images.map(i => `  - ${i}`).join('\n'));

    // 2. Iniciar Playwright
    console.log('\n🚀 Iniciando navegador...');
    const browser = await chromium.launch({ headless: false }); // Rodar visível
    const context = await browser.newContext(
        fs.existsSync(AUTH_FILE) ? { storageState: AUTH_FILE } : {}
    );
    const page = await context.newPage();

    console.log(`🌐 Navegando para: ${GLIDE_URL}`);
    await page.goto(GLIDE_URL);

    // 3. Checar Login
    console.log('⏳ Aguardando carregamento da interface...');
    console.log('👉 SE FOR PEDIDO LOGIN: Faça o login na tela. O robô vai aguardar até você entrar.');
    
    // Espera até que algum elemento conhecido da página do Glide carregue
    // O usuário deve estar na aba correta. Se não estiver, o robô vai travar esperando.
    // Vamos dar um tempo generoso para o usuário fazer login se precisar.
    
    console.log('Aguardando 10 segundos para estabilização ou login manual...');
    await page.waitForTimeout(10000);
    
    // Salvar sessão para a próxima vez
    await context.storageState({ path: AUTH_FILE });
    console.log('✅ Sessão salva em .auth-glide.json');

    console.log('\n======================================================');
    console.log('ATENÇÃO: A automação vai começar os cliques!');
    console.log('Não mexa no mouse nem no teclado pelas próximas etapas.');
    console.log('======================================================\n');

    // 4. Executar os 7 passos descritos
    // Como os seletores do Glide são dinâmicos e opacos, usaremos seletores genéricos visuais (Aria Roles, Titles)
    
    for (let i = 0; i < images.length; i++) {
        const imagePath = path.join(extractDir, images[i]);
        console.log(`🔄 Processando Semana ${i + 1} de ${images.length}...`);

        try {
            // Passo 3: Clicar no botão 'X' de delete da imagem atual (se existir)
            // No Glide, os botões X costumam ter aria-label "Clear" ou "Delete" ou ser um SVG específico
            // Aqui estamos buscando todos os botões de clear image. O nth(i) pega o da semana atual.
            
            // Tentativa de achar o botão "X" da imagem
            const clearButtons = page.locator('[aria-label="Clear value"], [aria-label="Remove image"], svg path[d*="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"]');
            
            if (await clearButtons.count() > i) {
                console.log(`  🗑️  Clicando no 'X' (deletando imagem antiga)`);
                await clearButtons.nth(i).click();
                await page.waitForTimeout(1000);
                
                // Passo 4: Clicar no botão 'Delete' do modal
                // O modal tem texto "Delete File" e botão "Delete"
                const confirmDelete = page.getByRole('button', { name: 'Delete' });
                if (await confirmDelete.count() > 0) {
                    await confirmDelete.first().click();
                    console.log(`  ✅ Modal de confirmação aceito.`);
                    await page.waitForTimeout(1500);
                }
            }

            // Passo 5, 6 e 7: Upload do arquivo pulando o Explorer do Windows!
            console.log(`  📤 Fazendo upload do arquivo: ${images[i]}`);
            
            // No Glide, o campo de imagem vazio exibe "Choose an image..." e contém um <input type="file"> oculto
            // O Playwright consegue mandar o arquivo direto para esse input sem abrir janelas do Windows
            const fileInputs = page.locator('input[type="file"]');
            
            if (await fileInputs.count() > i) {
                // Seta o arquivo silenciosamente
                await fileInputs.nth(i).setInputFiles(imagePath);
                console.log(`  ✅ Upload injetado com sucesso!`);
            } else {
                console.error(`  ❌ Input de arquivo não encontrado para a semana ${i + 1}`);
            }

            // Esperar o upload terminar antes de ir pra próxima (Glide demora uns segundos)
            console.log('  ⏳ Aguardando 5 segundos para o Glide processar o upload...');
            await page.waitForTimeout(5000);

        } catch (err) {
            console.error(`❌ Erro ao automatizar a semana ${i + 1}:`, err);
        }
    }

    console.log('\n🎉 Sincronização Finalizada!');
    console.log('O navegador será fechado em 5 segundos.');
    await page.waitForTimeout(5000);
    await browser.close();
}

run().catch(console.error);
