import { test, expect, request } from '@playwright/test';

test.describe('Swap Happy Path', () => {
  test.beforeAll(async () => {
    // Initialize the Market Maker wallet before tests run
    // Retry logic to wait for API server to be ready
    const maxRetries = 10;
    const retryDelay = 1000; // 1 second
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const apiRequest = await request.newContext();
        const response = await apiRequest.post('http://127.0.0.1:3001/faucet/maker');
        
        if (response.ok()) {
          console.log('Market Maker wallet funded successfully');
          return;
        }
        
        throw new Error(`Faucet API returned status ${response.status()}`);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < maxRetries) {
          console.log(`Attempt ${attempt} failed, retrying in ${retryDelay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
        }
      }
    }

    throw new Error(`Failed to fund Market Maker wallet after ${maxRetries} attempts: ${lastError?.message}`);
  });

  test('Connect -> Lift -> Swap -> Success', async ({ page }) => {
    // Setup: Navigate to home page
    await page.goto('/');

    // Clear localStorage to start fresh
    await page.evaluate(() => {
      localStorage.clear();
    });

    // Reload to ensure clean state
    await page.reload();

    // Step 1: Connect Wallet
    await test.step('Connect Wallet', async () => {
      // Click "Connect Wallet" button
      await page.click('button:has-text("Connect Wallet")');

      // Assert "Your Ark Balance" is visible
      await expect(page.locator('text=Your Ark Balance')).toBeVisible();
    });

    // Step 2: Lift (Deposit)
    await test.step('Lift (Deposit)', async () => {
      // Get the balance text element (contains number and "ARK")
      const balanceLocator = page.locator('h2:has-text("Your Ark Balance")').locator('..').locator('p.text-3xl');

      // Click "Deposit" button
      await page.click('button:has-text("Deposit")');

      // Wait for the balance to increase
      // This waits for the 5s round to finalize with some cushion
      await expect(balanceLocator).toContainText('10,000', { timeout: 15000 });
    });

    // Step 3: Swap
    await test.step('Swap', async () => {
      // Fill "Amount to swap" input
      const amountInput = page.locator('input[placeholder="Amount to swap"]');
      await amountInput.fill('5000');

      // Click "Request Quote" button
      await page.click('button:has-text("Request Quote")');

      // Wait for "Lock Address" to appear
      await expect(page.locator('text=Lock Address:')).toBeVisible({ timeout: 30000 });

      // Fill "Your L1 Address" input
      const l1AddressInput = page.locator('input[placeholder="Enter your Bitcoin address"]');
      await l1AddressInput.fill('bcrt1q0lzm0f7fp3njv6pqw3sxuh243dpt4puv2as42r');

      // Click "Confirm Swap" button
      await page.click('button:has-text("Confirm Swap")');
    });

    // Step 4: Success
    await test.step('Success', async () => {
      // Wait for the Success UI
      await expect(page.locator('text=Success!')).toBeVisible({ timeout: 30000 });

      // Assert that "L1 Transaction ID" label is visible
      const l1TxIdLabel = page.locator('text=L1 Transaction ID:');
      await expect(l1TxIdLabel).toBeVisible();

      // Get the transaction ID text (should be a hash)
      // The L1 Transaction ID is in a paragraph with class "text-sm font-mono text-green-400"
      // It's in the same container as the label
      const txIdElement = page.locator('text=L1 Transaction ID:').locator('..').locator('p.text-sm.font-mono.text-green-400');
      await expect(txIdElement).toBeVisible();
      
      const txIdText = await txIdElement.textContent();
      expect(txIdText).toBeTruthy();
      expect(txIdText!.trim().length).toBeGreaterThan(10); // Hash should be at least 10 characters
    });
  });
});

