// Backward-compatible entry point. The turn-based route lives in checkpoint aa7b0dc.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const script=fileURLToPath(new URL('./campaign-browser-check.mjs',import.meta.url));
const child=spawn(process.execPath,['--import','tsx',script],{cwd:root,stdio:'inherit',env:process.env});
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
