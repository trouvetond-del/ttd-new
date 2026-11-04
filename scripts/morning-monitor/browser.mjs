import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
const checks=[];
const browser=await chromium.launch({headless:true});
try {
  for (const path of ['/', '/client/quote', '/blog','/calculateur-prix-demenagement']) {
    const page=await browser.newPage({viewport:{width:1280,height:1800}});
    const errors=[];
    page.on('pageerror',()=>errors.push('Erreur JavaScript'));
    try {
      await page.goto(`https://www.trouvetondemenageur.fr${path}`,{waitUntil:'networkidle',timeout:45000});
      const text=await page.locator('body').innerText();
      const visible=await page.locator('h1').count();
      checks.push({name:`Navigateur ${path}`,status:visible && text.length>100 && !errors.length?'ok':'warning',detail:visible && !errors.length?'Page affichée, titre présent, aucune erreur JavaScript détectée.':'Affichage ou JavaScript à vérifier.'});
    } catch { checks.push({name:`Navigateur ${path}`,status:'unknown',detail:'Affichage non vérifié (délai ou accès).'}); }
    await page.close();
  }
} finally { await browser.close(); }
await writeFile('morning-browser.json',JSON.stringify(checks));
