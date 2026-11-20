// Run from the project root with Playwright Chromium installed. No bake work at game startup.
import { chromium } from 'playwright';
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
const bundle=await build({entryPoints:['drive-simulation/src/engine/textures.ts'],bundle:true,globalName:'source',write:false,alias:{three:'./node_modules/three/build/three.module.js'}});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
try{const page=await browser.newPage();await page.addScriptTag({content:bundle.outputFiles[0].text});
 const images=await page.evaluate(()=>{const t=source; t.limitTextureSize(1024); const sets={brick:t.makeTiles('worm'),slab:t.makeTiles('square'),trunk:t.makeBark(),tin:t.makeCorrugated(),stucco:t.makePlaster('#e6dfcc',19),shop3:t.makeFacade(3,'#c4bf9e',2,117),shop5:t.makeFacade(5,'#c4d2cb',3,134),bay:{map:t.makeBusBay()},crossing:{map:t.makeZebra()},pool:{mask:t.makePuddleMask()},light:{beam:t.makeBeam()},bus:{print:t.makeBusLivery()},stop:{ad:t.makeAdPanel(1)},street:{scraps:t.makeLitter()}};const out={};for(const [name,maps] of Object.entries(sets))for(const [k,v] of Object.entries(maps))out[name+'-'+k]=v.image.toDataURL('image/webp',.92).split(',')[1];return out});
 const dir='public/images/drive-look';await mkdir(dir,{recursive:true});for(const [name,b64] of Object.entries(images))await writeFile(`${dir}/${name}.webp`,Buffer.from(b64,'base64'));
}finally{await browser.close()}
