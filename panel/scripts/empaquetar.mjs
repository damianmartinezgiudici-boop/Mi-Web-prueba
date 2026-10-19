// Arma una versión de un solo archivo de cada función, para pegarla en el editor web de Supabase.
// Uso: node scripts/empaquetar.mjs   →   supabase/para-pegar/<funcion>.ts
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';

const base = new URL('../supabase/', import.meta.url);
const compartido = (nombre) => readFileSync(new URL(`functions/_shared/${nombre}`, base), 'utf8');
mkdirSync(new URL('para-pegar/', base), { recursive: true });

for (const fn of readdirSync(new URL('functions/', base)).filter((f) => !f.startsWith('_'))) {
  let codigo = readFileSync(new URL(`functions/${fn}/index.ts`, base), 'utf8');
  const npm = new Set();
  const usados = [...codigo.matchAll(/^import .* from '\.\.\/_shared\/(.+?)';\n/gm)].map((m) => m[1]);
  codigo = codigo.replace(/^import .* from '\.\.\/_shared\/.+?';\n/gm, '');
  let inline = '';
  for (const archivo of usados) {
    let c = compartido(archivo);
    for (const m of c.matchAll(/^import .*;\n/gm)) npm.add(m[0]);
    c = c.replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
    inline += `// ── ${archivo} ──\n${c}\n`;
  }
  const salida = `// Generado por scripts/empaquetar.mjs a partir de supabase/functions/${fn}. No editar a mano.\n`
    + [...npm].join('') + '\n' + inline + `// ── ${fn} ──\n` + codigo;
  writeFileSync(new URL(`para-pegar/${fn}.ts`, base), salida);
  console.log(fn, salida.split('\n').length, 'líneas');
}
