const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '../workflows/n8n');

const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));

for (const file of files) {
  const filePath = path.join(dir, file);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  for (const node of data.nodes) {
    // 1. En nodos Code que preparan el prompt
    if (node.type === 'n8n-nodes-base.code' && node.parameters?.jsCode?.includes('systemPrompt')) {
      if (!node.parameters.jsCode.includes('apiKey:')) {
        node.parameters.jsCode = node.parameters.jsCode.replace(
          /model:\s*\$env\.OPENROUTER_MODEL[^,\n]*,/g,
          "model: $env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free',\n    apiKey: $env.OPENROUTER_API_KEY || '',"
        );
      }
    }

    // 2. En nodos HTTP Request que llaman a OpenRouter
    if (node.type === 'n8n-nodes-base.httpRequest' && node.parameters?.url?.includes('openrouter.ai')) {
      node.parameters.authentication = 'none';
      delete node.parameters.genericAuthType;

      const titleParam = node.parameters.headerParameters?.parameters?.find(p => p.name === 'X-Title');
      const titleValue = titleParam ? titleParam.value : 'RAX Mentorship Platform';

      node.parameters.headerParameters = {
        parameters: [
          {
            name: 'Authorization',
            value: '=Bearer {{ $json.apiKey || $env.OPENROUTER_API_KEY }}'
          },
          {
            name: 'HTTP-Referer',
            value: 'https://rax.app'
          },
          {
            name: 'X-Title',
            value: titleValue
          }
        ]
      };
    }
  }

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  console.log('Fixed:', file);
}

console.log('All workflow files cleanly updated.');
