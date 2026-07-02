/* Publica o próximo post da fila (blog-fila.json → blog-posts.json + sitemap.xml).
   Rodado diariamente pelo GitHub Actions (.github/workflows/blog-diario.yml). */
import { readFileSync, writeFileSync } from 'node:fs';

const SITE = 'https://raphaelmarge.github.io/claudec';
const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); // YYYY-MM-DD

const fila = JSON.parse(readFileSync('blog-fila.json', 'utf8'));
const posts = JSON.parse(readFileSync('blog-posts.json', 'utf8'));

if (posts.some(p => p.data === hoje)) {
  console.log(`Já existe post de ${hoje} — nada a fazer.`);
  process.exit(0);
}
if (!fila.length) {
  console.log('FILA VAZIA — nenhum post para publicar. Reabasteça blog-fila.json.');
  process.exit(0);
}

const post = fila.shift();
post.data = hoje;
posts.unshift(post);

writeFileSync('blog-fila.json', JSON.stringify(fila, null, 2) + '\n');
writeFileSync('blog-posts.json', JSON.stringify(posts, null, 2) + '\n');

// sitemap: atualiza lastmod do blog e insere a URL do novo post logo após a entrada do blog
let sm = readFileSync('sitemap.xml', 'utf8');
const blogUrl = `${SITE}/blog.html`;
sm = sm.replace(
  new RegExp(`(<url><loc>${blogUrl.replace(/[.\/]/g, m => '\\' + m)}</loc><lastmod>)[^<]*(</lastmod>)`),
  `$1${hoje}$2`
);
const nova = `  <url><loc>${blogUrl}?post=${post.slug}</loc><lastmod>${hoje}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>\n`;
if (!sm.includes(`?post=${post.slug}<`)) {
  sm = sm.replace(/(<url><loc>[^<]*blog\.html<\/loc>[^\n]*\n)/, `$1${nova}`);
}
writeFileSync('sitemap.xml', sm);

console.log(`Publicado: "${post.titulo}" (${post.slug}) em ${hoje}. Restam ${fila.length} na fila.`);
if (fila.length <= 3) console.log(`::warning::Fila do blog com só ${fila.length} post(s) — hora de reabastecer blog-fila.json.`);
