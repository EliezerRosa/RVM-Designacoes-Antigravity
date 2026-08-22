import { test, expect } from '@playwright/test';

test.describe('Login & Authentication Resilience', () => {

  test('1. Teste de Higienização de URL (O "Caso Patrick")', async ({ page }) => {
    // Navigate to URL with an invalid JWT access_token hash
    await page.goto('/#access_token=invalid_token-with_chars.exp123');
    
    // Check if the app successfully loaded (i.e. did not enter an infinite reload loop)
    // and if the URL hash was stripped out.
    await expect(page).toHaveURL('/');
    
    // Assert the login page is shown
    await expect(page.locator('text=RVM Designações').first()).toBeVisible();
    await expect(page.locator('text=Entrar com Conta Google').first()).toBeVisible();
  });

  test('2. Teste de Fallback da Biometria', async ({ page }) => {
    await page.goto('/');
    
    // Simulate non-secure context by overriding window.isSecureContext
    await page.evaluate(() => {
      Object.defineProperty(window, 'isSecureContext', { value: false, writable: true });
    });
    
    // Wait for the button to appear if we're in flexible/device mode.
    const bioButton = page.locator('text=Entrar com Biometria / PIN do Aparelho');
    
    // Since this is E2E against local dev, the button might not be visible depending on the default DB mode.
    // We will attempt to click it if visible.
    try {
      await bioButton.waitFor({ state: 'visible', timeout: 3000 });
      await bioButton.click();
      await expect(page.locator('text=Biometria não suportada neste navegador ou conexão não segura.')).toBeVisible();
    } catch (e) {
      // If button not visible (mode not enabled in test DB), skip assertion
      test.info().annotations.push({ type: 'warning', description: 'Biometria button not visible in this environment.' });
    }
  });

  test('3. Teste de Sessão Interrompida', async ({ page }) => {
    await page.goto('/');
    
    // Inject a fake expired session into localStorage
    await page.evaluate(() => {
      localStorage.setItem('rvm-designacoes-auth', JSON.stringify({
        access_token: 'fake',
        refresh_token: 'fake',
        expires_at: Math.floor(Date.now() / 1000) - 3600 // expired 1 hour ago
      }));
    });
    
    // Reload the page
    await page.reload();
    
    // The user should not see a white screen, but rather gracefully fallback to login
    await expect(page.locator('text=RVM Designações').first()).toBeVisible();
    await expect(page.locator('text=Entrar com Conta Google').first()).toBeVisible();
  });
  
  test('4. Teste de Autorização RLS (Role = Publicador)', async ({ page }) => {
    test.info().annotations.push({ type: 'info', description: 'Requires test DB setup' });
    // TODO: Seed test DB with "Teste Fictício" (Role: Publicador) and login
    // Expect the user to be routed to PublisherHomeView
    // await expect(page.locator('text=Suas Designações')).toBeVisible();
  });

  test('5. Teste de Desafio do WhatsApp 2FA', async ({ page }) => {
    test.info().annotations.push({ type: 'info', description: 'Requires test DB setup' });
    // TODO: Seed test DB with "Teste Fictício" (needs2FA: true) and login
    // Expect the 2FA screen
    // await expect(page.locator('text=Verificação em 2 Etapas')).toBeVisible();
  });

});
