# Verificação — JP Minato 1.16

178 testes automatizados: fluxos anteriores e 36 casos novos.

Cobertura nova: vínculo de aba e percurso, escopos de contatos/brasão, tenant
em domínio compartilhado, navegação manual, URL raiz, DNS público e redirect
para rede interna, SVG externo, agenda CSV, identidade por conta, correção de
nome, novo presidente sem reaproveitar contatos pessoais, vínculo revisado,
edições manuais, etag, criação com resposta perdida, reconciliação, OAuth local
com estado/PKCE, Google obrigatório antes da fila, conta exclusiva, positivo,
ausência explícita, inconclusivo, número alterado, cancelamento/reinício,
lease expirada, inválidos, cache, idempotência e correção auditada de envio.

Navegador Chromium com servidor real em dados temporários: seleção marcada,
desmarcação preservada, popup bloqueado sem registro, destinatários em sequência,
histórico reversível e contadores, CSV baixado, configuração de número exclusivo
e fila aguardando Google. Zero erros JavaScript no fluxo testado.

Menus e serviço da extensão testados com APIs Chrome simuladas. Ponte de consulta
testada com WA-JS simulado: getMyUserId, isAuthenticated, isOnline e queryWidExists;
nenhum método de envio do código JP Minato é acionado. Bundle WA-JS 4.6.1 incluído
com licença e integridade verificadas.

Limites: não houve autorização em conta Google real, alteração de contatos reais,
consulta real de números, mensagem, e-mail ou restauração paga. Aplicativos de
envio e APIs externas foram simulados nos testes. Instalação, DPAPI, VBS, atalhos,
permissões/menu Chrome e Firewall precisam de execução nativa no Windows.
Conexão física casa/escritório não foi testada neste ambiente. O validador é
protótipo não oficial e precisa de pequeno teste com sessão real antes de lotes.

Banco original fornecido não foi alterado. Pacote sem dados de produção,
credenciais, ambientes virtuais, node_modules ou navegador de teste.
