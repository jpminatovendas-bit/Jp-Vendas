# Verificação 1.31.3 / extensão 1.17.2

- Python: 331 testes executados; OK, um ignorado.
- Runtime Node simulado: PN exato, PN canônico com omissão exclusiva do nono dígito brasileiro no retorno da consulta, vínculo LID/PN, mapeamento divergente, DDD/dígito divergente, null/undefined e conta diferente.
- Integração: service worker real, HTTP/SQLite reais e Chrome/WhatsApp simulados. Fluxo completo com destino canônico conferido e usado no envio; histórico conserva o número cadastrado. Aba/painel reutilizados, resposta perdida/interrupção sem reenvio, resultado vazio inconclusivo sem apagar confirmação anterior. Sintaxe JavaScript conferida.
- Nenhuma conta real, mensagem real ou nova validação visual de navegador. A operação real ainda depende da sessão do usuário e compatibilidade da biblioteca WA-JS.

Consulta null não comprova ausência, pois a WA-JS 4.7.1 também retorna null quando captura exceções. Esta versão não confirma ausência a partir desse retorno. Identificador LID precisa de vínculo exato ao LID consultado e PN correspondente. Nunca busca números alternativos por tentativa. O destino canônico é guardado separadamente sem modificar a ficha.
