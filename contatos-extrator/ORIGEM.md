# Motor de contatos JP Minato

Derivado de Extrator-IA-completo.zip.zip, projeto fornecido pelo usuário, originalmente em TypeScript/Express/Cheerio/@google/genai.

Mantidas as funções de identificação de plataformas, navegação de Mesa Diretora/perfil/contato, extração determinística, síntese Gemini opcional, busca e regras por fornecedor.

Adaptações: servidor local reservado ao Python; porta dinâmica; token; configuração pelo painel; arquivo de regras em dados/extrator-contatos; HTTP direto sem shell e sem TLS desativado; limites de navegação; sem cookies e sem consultas a arquivos históricos. O modo JP_TEST_ALLOW_LOOPBACK é usado apenas pelos testes locais, sem controle na interface.

engine.cjs é compilado de server.ts/jp-network.ts. Dependências instaladas por INSTALAR_EXTRATOR.bat. Para desenvolver: npm ci e npm run build dentro desta pasta.

SDK/modelos: https://ai.google.dev/api/generate-content e https://ai.google.dev/gemini-api/docs/models.
