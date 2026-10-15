// Isolated browser fixture: no provider calls, tokens or saved knowledge.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
const assets = new Map([
  ['/', 'lib/epace/starter.html'],
  ['/assets/marked.js', 'node_modules/marked/lib/marked.umd.js'],
  ['/assets/purify.js', 'node_modules/dompurify/dist/purify.min.js'],
]);
const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && assets.has(req.url)) {
    res.writeHead(200, { 'Content-Type': req.url === '/' ? 'text/html' : 'text/javascript' });
    res.end(await readFile(assets.get(req.url)));
    return;
  }
  let input = '';
  for await (const chunk of req) input += chunk;
  const data = JSON.parse(input || '{}');
  const attack = String(data.question).includes('security');
  const answer = attack
    ? '## Security fixture\n\n<script>alert("unsafe")</script><img src=x onerror="alert(1)"><a href="javascript:alert(1)">Unsafe link</a>\n\n**Safe bold text** remains.'
    : '## Integration overview\n\nThese are **browser verification fixtures**, not live service readings.\n\n1. **Prometheus** collects monitoring metrics.\n2. **Alertmanager** manages alerts and silences.\n3. **Semaphore** runs configured automation tasks. [1]\n\n| Service | Purpose |\n| --- | --- |\n| Prometheus | Metrics |\n| Alertmanager | Alerts |\n\n```javascript\nconst service = "eAssist";\n```\n\n> Check supporting evidence before taking action.';
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ answer, sources: [{ name: 'Verification fixture.txt', text: 'This source is a browser-rendering fixture.' }], usage: { total_tokens: 123 }, latencyMs: 1200 }));
});
server.listen(3101, '127.0.0.1', () => console.log('Isolated Markdown browser fixture listening on localhost:3101'));
