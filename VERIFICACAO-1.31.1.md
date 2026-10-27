# Correção da estação WhatsApp — 1.31.1 / extensão 1.17.1

23/10/2026. Capturas do usuário: painel com diagnóstico genérico e console com módulo isLidMigrated não encontrado e func is not a function. Não é evidência de senha ou número preenchido incorretamente. Os avisos internos, isoladamente, não permitem concluir a causa exata da desconexão sem ler o estado da sessão real.

- WA-JS atualizado da versão 4.6.1 para a release estável 4.7.1, obtida do registro npm oficial do pacote. Tarball validado pelo SHA-512 publicado no registro. Arquivo JS não modificado; licença Apache e avisos de terceiros incluídos.
- Identificação/consulta/envio concentrados em office-runtime132.js, executado no contexto principal da aba. Prioridade ao PN da conta por UserPrefs.getMaybeMePnUser, com fallback aos métodos documentados conn.getMyUserWid/getMyUserId. Identificadores @lid nunca são tratados como telefone. Nenhum override de isLidMigrated ou de regras de migração.
- Carregamento da biblioteca, QR/autenticação, rede offline, leitura do número, conta diferente e erro de script têm motivos separados. Exceção original não é escondida como conta diferente. Biblioteca antiga em aba já aberta é detectada quando informa versão; usuário orientado a fechar/reabrir a aba. Arquivos locais da extensão, sem CDN na execução.
- Continua exigindo conta configurada antes/depois da consulta e envio. Consulta sem resultado comprovado permanece inconclusiva. Ausência somente por null explícito com identidade correta; envio com ID/ACK. Histórico, idempotência e recuperação sem repetir envio preservados. Nenhuma mensagem real enviada.
- Teste de integração Node com service worker e HTTP/SQLite reais, Chrome/WhatsApp simulados: reuso da aba/painel, consulta antes do envio, ACK, ausência explícita, inconclusivo, resposta HTTP perdida e interrupção sem reenvio. Casos acrescentados para PN com LID simultâneo, LID sem PN, exceção isLidMigrated, carregamento, não autenticado e biblioteca antiga. Verificações sintáticas de JS e compilação Python.
- Testes não estabelecem compatibilidade com a sessão real do usuário. Esta correção precisa de teste no escritório após recarregar a extensão e abrir uma aba nova do WhatsApp Web. Não é alegada validação de login real.

Fontes do componente:
- https://github.com/wppconnect-team/wa-js/releases/tag/v4.7.1
- https://registry.npmjs.org/@wppconnect/wa-js/4.7.1
- Tipos originais do pacote: dist/conn/functions/getMyUserWid.d.ts e dist/contact/functions/queryWidExists.d.ts.

Regressão Python: 327 testes OK, um ignorado por condição de ambiente. A atualização de versão do iniciador/health e o novo diagnóstico não alteram o login de operadores, a caixa IMAP ou os cadastros.
