import {build} from 'vite';
import {sites} from '@openai/sites-vite-plugin';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const stage=path.join(root,'.runtime','hosted-source');
await fs.mkdir(stage,{recursive:true});
// A dedicated staging tree leaves the approved local preview intact.
for(const item of ['src','shared','server','hosted','drizzle','.openai','index.html','package.json','package-lock.json']){
 await fs.cp(path.join(root,item),path.join(stage,item),{recursive:true,force:true});
}
await fs.symlink(path.join(root,'node_modules'),path.join(stage,'node_modules'),'dir').catch(error=>{if(error.code!=='EEXIST')throw error;});
await build({root:stage,configFile:false,plugins:[sites()],build:{outDir:path.join(stage,'dist','client'),emptyOutDir:true,chunkSizeWarningLimit:900}});
await build({root:stage,configFile:false,plugins:[sites()],resolve:{alias:{'node:crypto':path.join(stage,'hosted','web-crypto.ts')}},build:{
 ssr:path.join(stage,'hosted','worker.ts'),outDir:path.join(stage,'dist','server'),emptyOutDir:true,target:'es2022',
 rolldownOptions:{output:{entryFileNames:'index.js',format:'es',inlineDynamicImports:true}},
}});
console.log(`Hosted build ready: ${path.join(stage,'dist')}`);
