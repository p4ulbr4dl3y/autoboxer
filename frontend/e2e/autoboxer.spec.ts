import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

test.describe('Autoboxer End-to-End User Journey', () => {
  const testProjectName = `E2E Traffic Signs_${Date.now()}`;
  let dummyImagePath: string;

  test.beforeAll(async () => {
    // Create a mock image file for upload testing
    dummyImagePath = path.join(__dirname, 'dummy_test_image.jpg');
    const base64Jpg = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
    fs.writeFileSync(dummyImagePath, Buffer.from(base64Jpg, 'base64'));
  });

  test.afterAll(async () => {
    // Clean up mock image
    if (fs.existsSync(dummyImagePath)) {
      fs.unlinkSync(dummyImagePath);
    }
  });

  test('should create project, upload image, annotate, and export dataset', async ({ page }) => {
    // 1. Visit Dashboard
    await page.goto('/');
    await expect(page.locator('h1')).toHaveText('Autoboxer');

    // 2. Open Create Project Modal
    await page.click('button:has-text("New Project")');
    await expect(page.locator('role=dialog')).toBeVisible();

    // Fill Name & Class details
    await page.fill('input[placeholder="e.g. Traffic Sign Detection"]', testProjectName);
    await page.fill('input[placeholder="e.g. cat"]', 'sign');
    await page.fill('input[placeholder="e.g. Locate cat."]', 'Locate signs.');

    // Submit form
    await page.click('button[type="submit"]:has-text("Create")');
    await expect(page.locator('role=dialog')).toBeHidden();

    // 3. Confirm redirection to project gallery
    await expect(page).toHaveURL(/.*\/projects\/\d+/);
    await expect(page.locator('h2')).toHaveText(testProjectName);
    await expect(page.locator('button:has-text("sign")')).toBeVisible();

    // 4. Upload Image
    await page.setInputFiles('input#file-upload-input', dummyImagePath);

    // Wait for the uploaded image card to appear
    const imageCard = page.locator('div.aspect-video');
    await expect(imageCard).toBeVisible({ timeout: 10000 });

    // 5. Open Annotation Editor
    await imageCard.click();
    await expect(page).toHaveURL(/.*\/editor/);
    await expect(page.locator('header')).toContainText('dummy_test_image.jpg');

    // 6. Draw Bounding Box manually (Simulate Drag)
    await page.click('button[title="Draw Bounding Box (D)"]');
    
    const workspace = page.locator('section.canvas-grid');
    const bounds = await workspace.boundingBox();
    if (bounds) {
      const startX = bounds.x + bounds.width / 3;
      const startY = bounds.y + bounds.height / 3;
      const endX = bounds.x + bounds.width / 2;
      const endY = bounds.y + bounds.height / 2;

      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(endX, endY);
      await page.mouse.up();
    }

    // Verify manual box has been registered in the sidebar
    await expect(page.locator('aside')).toContainText('Annotations (1)');

    // 7. Run AI Auto-Labeling
    await page.click('button:has-text("Run Grounding")');

    // 8. Save & Exit
    await page.click('button:has-text("Save & Exit")');
    await expect(page).toHaveURL(/.*\/projects\/\d+/);

    // 9. Export ZIP Dataset (YOLO Format)
    await page.click('button:has-text("Export")');
    
    // Choose YOLO and download
    const downloadPromise = page.waitForEvent('download');
    await page.click('button:has-text("Export Project")');
    const download = await downloadPromise;
    
    // Assert download is successful and has zip extension
    expect(download.suggestedFilename()).toContain('.zip');
  });
});
