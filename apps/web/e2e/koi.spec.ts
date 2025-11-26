import { test, expect } from '@playwright/test';

test.setTimeout(120000);

test.describe('SatoshiKoi Asset Lifecycle', () => {
  test.beforeAll(async ({ request }) => {
    // The CI pipeline guarantees the API is up and the Maker is funded.
    // We can do a quick sanity check or just proceed.
    const response = await request.post('http://127.0.0.1:3001/faucet/maker');
    expect(response.ok()).toBeTruthy();
  });

  test('Connect -> Mint Gen 0 Koi -> Discover Asset', async ({ page }) => {
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
      await expect(page.getByText('Your Ark Balance')).toBeVisible({ timeout: 15000 });
    });

    // Step 2: Assert SatoshiKoi Pond is visible
    await test.step('Assert SatoshiKoi Pond Section', async () => {
      // Assert "SatoshiKoi Pond" title is visible
      await expect(page.getByText('SatoshiKoi Pond')).toBeVisible();
      
      // Assert "Mint Gen 0 Fish" button is visible
      await expect(page.getByRole('button', { name: /Mint Gen 0 Fish/i })).toBeVisible();
    });

    // Step 3: Mint Gen 0 Koi
    await test.step('Mint Gen 0 Koi', async () => {
      // Click "Mint Gen 0 Fish" button
      await page.click('button:has-text("Mint Gen 0 Fish")');

      // Wait for "Minting..." state to appear (button text changes)
      await expect(page.getByRole('button', { name: /Minting/i })).toBeVisible({ timeout: 5000 });

      // Wait for status message to appear
      await expect(page.getByText(/Fish sent to pool/i)).toBeVisible({ timeout: 10000 });
    });

    // Step 4: Wait for asset to appear in coin list
    await test.step('Discover Asset in Wallet', async () => {
      // Wait for the "Available Coins" section to be visible (if not already)
      // This ensures the coin list UI is rendered
      // The section only renders when vtxos.length > 0, so this effectively waits for blockchain confirmation
      await expect(page.getByText('Available Coins')).toBeVisible({ timeout: 15000 });

      // Wait for "Gen 0 Koi" to appear in the coin list as an interactive button
      // This targets the actual coin item in the wallet list, not the static description text
      // Allow 15s timeout for the round to finalize and asset to be discovered
      await expect(page.getByRole('button', { name: /Gen 0 Koi/i })).toBeVisible({ timeout: 20000 });

      // Additional verification: Check that the Assets section exists
      // This confirms the asset is in the correct section (not standard VTXOs)
      await expect(page.getByText(/Assets \(\d+\)/i)).toBeVisible({ timeout: 5000 });
    });
  });
});

