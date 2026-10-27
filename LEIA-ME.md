# JP Minato completo — MVP 1.36 · extensão 1.18.0

Leia primeiro **INICIO-AQUI-1.36.txt**.

Este pacote reúne o programa completo e as atualizações até a versão 1.36, com o mapa simplificado. Não depende de instalar os ZIPs anteriores em sequência.

A pasta de dados atual do escritório não está incluída. Em outro computador, esta instalação terá uma base independente; ela não transfere os seus cadastros editados, fotos, PDFs, rotas e históricos do escritório.

Esta é a edição local para Windows. A hospedagem on-line exige adaptação do servidor, banco e arquivos; este pacote ainda não é um projeto pronto para publicar na Vercel.

Os guias abaixo são o histórico das versões anteriores. Para a instalação atual, use INICIO-AQUI-1.36.txt e ATUALIZAR-MAPA-SIMPLES-1.36.txt.

---

# Correção atual: MVP 1.31.2 · conta WhatsApp PN

Leia CORRECAO-CONTA-WHATSAPP-1.31.2.txt. A extensão permanece 1.17.1. Preserve dados.

# Correção atual: JP Minato 1.31.1 · extensão 1.17.1

Leia [ATUALIZAR-WHATSAPP-1.31.1.txt](ATUALIZAR-WHATSAPP-1.31.1.txt). Atualize os arquivos, recarregue a extensão e feche/reabra o WhatsApp Web para substituir o componente antigo. Preserve dados.

# Atualização atual: JP Minato 1.31

Leia [GUIA-ATUALIZACAO-1.31.html](GUIA-ATUALIZACAO-1.31.html) e [ATUALIZAR-1.31.txt](ATUALIZAR-1.31.txt). Operador obrigatório, responsáveis/atalhos de rotas, menus no topo, limpeza de seleção e caixa IMAP. Os três módulos antigos de extração/verificação foram retirados; instruções históricas abaixo podem se referir a versões anteriores. Preserve a pasta dados.

# JP Minato — Catálogos Municipais, MVP 1.30

Aplicativo Windows de contatos, fotos e PDFs municipais. Dados continuam no escritório em `E:\JP-Minato\dados`, quando instalado em `E:\JP-Minato`.

## Ícones e filtros de envio por canal/período — 1.30

A coluna Contato / envio mostra dois indicadores: WhatsApp e E-mail, com quantidade de envios válidos. Ícone colorido com marca de confirmação indica registro no período selecionado; cinza com traço indica ausência de registro no período. Clique no indicador para abrir a tela Enviar PDF e consultar o histórico. O ícone de envio é diferente da confirmação de existência de WhatsApp junto ao telefone.

Em Filtros e ferramentas → Envios por canal e período, configure WhatsApp e E-mail separadamente: Todos, Com envio ou Sem envio. As duas escolhas são combinadas. Exemplo: WhatsApp Sem envio + E-mail Com envio + Hoje encontra municípios que receberam e-mail hoje, sem registro de WhatsApp hoje. WhatsApp Com envio + E-mail Com envio exige ambos no período. Ambos Sem envio encontra municípios sem registros dos dois canais no período, mesmo que tenham envios em outro mês.

Períodos: Todo o histórico, Hoje, Esta semana (segunda a domingo), Este mês e Personalizado. Datas no horário de Brasília. Personalizado aceita início/fim inclusivos, ou apenas uma data para deixar o intervalo aberto. Datas inválidas/invertidas mostram aviso e nenhum resultado. Período ativo permanece indicado acima da lista, mesmo com o painel recolhido. Preferências novas são lembradas neste navegador; Limpar filtros também as remove.

Câmara e presidente são somados por padrão. O filtro detalhado de canal/destinatário permite restringir um papel junto ao filtro geral Com/Sem envio; Contato realizado mantém seu significado no histórico geral. Ícones sempre mostram os totais de cada canal no período. Filtros combinam com UF, DDD, setores, material e rotas salvas. Abrir rota não remove ações dos municípios.

Histórico existente é reaproveitado. Registros desmarcados, tentativas pendentes/rejeitadas de WhatsApp e falhas sem registro de envio não entram. Saudação válida conta como WhatsApp enviado, mesmo sem PDF; não se apresenta como PDF enviado. Mensagens manuais antigas contam conforme seu registro ativo, sem comprovar entrega/leitura. Dados antigos com data ilegível só entram em Todo o histórico, sem inventar um dia.

Atualize no escritório: parar servidor → backup integral de dados → mesclar pacote completo sem apagar dados → abrir ABRIR-JP-MINATO.vbs → Ctrl+F5. Extensão permanece 1.17.0, sem alteração nesta versão. Leia GUIA-ENVIOS-1.30.html. Conversa guiada e envio automático de PDF pelo WhatsApp continuam como etapa pendente de definição.

## Saudações pelo WhatsApp do escritório — 1.29

Protótipo de integração não oficial: o MVP recebe um clique individual e a extensão 1.17.0 executa a saudação pelo WhatsApp Web no Chrome do escritório. O acesso de casa pela VPN não abre outra aba de WhatsApp em casa. A extensão procura uma aba já existente e a reutiliza; só cria uma no momento da conexão inicial se nenhuma existir. Mantém o painel da estação separado e reutiliza esse painel ao reconectar.

Configure em WhatsApp do escritório: informe o número Business completo com DDD, ative o envio, ajuste limite (até 30 tentativas/dia) e mensagens de Câmara/presidente. As saudações têm seus próprios modelos para não anunciar um PDF que não foi anexado. Salve. Pelo MVP em http://127.0.0.1:8765 no escritório, clique Conectar no escritório. Atualize antes a extensão para 1.17.0. Mantenha Chrome, WhatsApp Web e painel da estação abertos; não exige outra conta Google ou sincronização prévia de agenda neste fluxo individual.

Enviar saudação funciona sem PDF pronto e transmite somente texto. A consulta do número ocorre antes da autorização do envio: número retornado igual ao solicitado confirma WhatsApp; null explícito com conta conectada registra ausência; erro/desconexão/retorno estranho fica inconclusivo e não retira confirmação anterior. Número alternativo com nono dígito diferente não é adotado por suposição. Conta diferente, cadastro/presidente alterado, Não contatar, pausa ou cancelamento antes da transmissão impedem o envio. Registro de mensagem só é criado com ID e ACK >= 1, sem marcar PDF enviado, entrega ou leitura.

Uma solicitação por vez e por clique. Aviso de repetição para número com envio/resultado incerto nos últimos sete dias; limite de tentativas é operacional e não garante evitar restrições. Estação desconectada não aceita nova solicitação; comandos não transmitidos expiram após dois minutos. Reinício não retoma automaticamente solicitações antigas. Diário local e identificador persistente evitam repetir uma transmissão por perda da resposta; resultado incerto exige conferência manual.

Atualização: parar servidor no escritório, backup integral de dados, mesclar pacote completo sem apagar dados, abrir programa, Ctrl+F5 e recarregar a extensão em chrome://extensions. Confira 1.17.0 no cartão. Leia GUIA-WHATSAPP-1.29.html. Compatibilidade com a sessão real do WhatsApp ainda exige teste inicial; a validação desta entrega usa WhatsApp/Chrome de extensão simulados e navegador real com servidor temporário, sem mensagens externas.

Respostas automáticas de conversa, captura de nome de atendimento e envio automático de PDF pelo WhatsApp não estão ativos nesta versão. Estão registrados como próxima etapa para definir perguntas, texto posterior, momento de enviar PDF e regra para nomes já preenchidos. Não confundir esta entrega de saudação com um robô que já acompanha as respostas.

## PDF compacto em A4 — 1.28

Todas as páginas geradas, incluindo o PDF padrão anexado, são enquadradas em A4 vertical (210 × 297 mm), preservando proporções e conteúdo inteiro. Não é um recorte nem uma imagem de tela do documento; textos e desenhos vetoriais continuam vetoriais. Links do catálogo são mantidos com suas áreas reposicionadas.

Nos comparativos, o programa incorpora cópias JPEG a 220 dpi no tamanho de apresentação, qualidade 85. Não amplia originais pequenos. Orientação EXIF e perfis de cor são tratados; transparência das fotos fica sobre branco. Brasões continuam em PNG com linhas/transparência preservadas e resolução limitada ao uso. As imagens originais e restauradas em alta resolução guardadas no acervo não são sobrescritas. A compactação ocorre ao gerar o PDF e não muda a restauração por IA nem seu custo.

Teste com Alecrim: imagens da segunda página passaram de 17,92 MB para 0,40 MB; a segunda página isolada ficou em 0,50 MB. PDF completo passou de 29,72 MB para 11,47 MB, com dez páginas A4. O restante do peso vem principalmente das páginas fixas. Estas páginas são redimensionadas sem recomprimir suas fotos nesta atualização. O resultado varia conforme o catálogo e as imagens de cada município.

PDFs existentes não são alterados automaticamente. Após atualizar, abra Criar PDF / fotos e clique em Gerar PDF final para cada município que quiser atualizar. PDFs anteriores e arquivos registrados no histórico de envio permanecem preservados. A versão nova mantém o envio SMTP, campos de diretor/atendimento e todas as funções anteriores. Extensão permanece 1.16.1.

Atualizar no escritório: parar servidor, backup integral de dados, mesclar todo o conteúdo de mvp-jp-minato na pasta instalada sem apagar dados, abrir ABRIR-JP-MINATO.vbs e Ctrl+F5. Leia ATUALIZAR-1.28.txt.

## E-mail direto e cadastro 1.27

Em Enviar PDF, os botões de e-mail enviam o texto e o PDF final do município diretamente pelo servidor configurado. Não abrem aplicativo externo. Câmara e Presidente mantêm destinatários e mensagens próprios; os modelos continuam em Configurações → Mensagens de apresentação. WhatsApp mantém o fluxo de confirmação da versão 1.26 e o anexo manual no aplicativo.

Clique em Configurar e-mail. Para KingHost por revenda, use smtp.uni5.net, porta 465, SSL/TLS, e-mail completo e senha da caixa postal. Salve e clique em Testar conexão (sem enviar e-mail). Depois, abra um município com PDF final atualizado e clique em Enviar no e-mail desejado. O teste autentica a conta, mas não envia mensagem. Confirme com a revenda o servidor se sua conta usar configuração diferente. Leia GUIA-EMAIL-1.27.html.

O histórico registra envio somente depois do aceite do SMTP, que não comprova entrega na caixa do destinatário. Falhas não contam como envio. Se a conexão cair sem resposta conclusiva, a tentativa fica incerta e não é reenviada automaticamente. Confira antes de repetir. O PDF usado em cada tentativa é preservado em dados/envios_email/anexos. Limite do programa: 18 MiB por PDF, antes da codificação do e-mail; a hospedagem pode impor limites menores. O SMTP não cria automaticamente uma cópia na pasta Enviados do webmail.

A senha fica protegida pelo Windows para o usuário do servidor, em dados/credenciais. A interface não devolve a senha salva. Para mudar de usuário Windows ou computador servidor, pode ser necessário cadastrá-la novamente. Não envie sua senha pelo chat.

Dados da Câmara agora inclui Diretor da Câmara (Nome) e Sec. Executivo / Atendimento (Nome), opcionais e separados do presidente. Edição persiste e é preservada nas reimportações; os nomes acompanham a exportação.

Atualização: pare o servidor no escritório, faça backup integral de dados e mescle todo o conteúdo desta pasta na instalação existente, substituindo os arquivos do programa sem apagar dados. Abra ABRIR-JP-MINATO.vbs e pressione Ctrl+F5 no navegador. Nenhuma nova dependência é necessária. Base PDF 1.25 e extensão 1.16.1 preservadas.

## Lista e envio WhatsApp 1.26

- Lista exibe um telefone por destinatário (Câmara e Presidente). O botão +N contatos abre os demais; o + simples continua adicionando telefone. Resumo de telefones e largura da coluna também compactados.
- Número confirmado recebe selo WhatsApp e botão Enviar verde mesmo antes de qualquer envio. O símbolo de envio é independente.
- Clicar Enviar para número não confirmado abre o aplicativo e guarda tentativa pendente. Após sair e retornar ao programa, aparece a pergunta Este número tem WhatsApp? Sim confirma e registra aquele envio; Não descarta da contagem; Conferir depois ou Esc mantém pendente, com botão Conferir número no histórico. Não é necessário confirmar números já conhecidos.
- Pendentes/rejeitados não contam nos filtros, indicadores ou mapa como envio de mensagem/PDF. Envios antigos de números ainda não confirmados também ficam pendentes de conferência, sem apagar histórico. Retirar a confirmação de um número invalida os seus registros ativos; reconfirmar depois não ressuscita envios cancelados.
- WhatsApp sem número identificável continua como link de abertura, sem confirmação ou registro de envio de um telefone por suposição. E-mails mantêm o fluxo anterior. Entrega e leitura não são comprovadas pelo programa; PDF precisa ser anexado no aplicativo.

Atualizar no computador do escritório: Parar servidor para atualizar → backup integral de dados → mesclar todo o conteúdo de mvp-jp-minato na pasta instalada, substituindo arquivos sem excluir dados → Abrir JP Minato → Ctrl+F5 no navegador. Nova tabela de controle criada automaticamente. Extensão permanece 1.16.1 sem alteração.

## Páginas personalizadas 1.25

A capa e os comparativos usam agora o visual das duas páginas fornecidas pelo usuário em paginas editaveis.pdf. Município/UF, brasão, nomes e pares originais/restauradas continuam automáticos. Até nove comparativos por página; páginas adicionais usam a mesma base. Fotos de exemplo e dados fixos de Faxinalzinho não são usados como contatos nem fotos de outro município. O período continua vindo do cadastro do projeto, sem herdar a legislatura de exemplo.

O PDF padrão enviado em Configurações continua vindo depois das páginas personalizadas. Não envie estas duas páginas nesse campo, para evitar duplicação. A nova base e as fontes são copiadas para dados/modelos/bases ao gerar o primeiro PDF. Modelos anteriores e PDFs já gerados ficam preservados. Para atualizar um PDF pronto: abrir município → Criar PDF / fotos → Gerar PDF final.

Atualizar: parar o servidor do escritório, fazer backup completo de dados, mesclar todos os arquivos de mvp-jp-minato na pasta instalada sem excluir dados, iniciar novamente e Ctrl+F5. A nova base entra automaticamente, sem upload nas configurações. Extensão permanece sem alterações.

## Envio 1.24 — Câmara e Presidente

Tela de envio com dois blocos, Câmara e Presidente, cada um com WhatsApp, e-mail e modelo correspondente. Cada contato tem botão Enviar: branco antes do registro, verde após salvar o acionamento. Registros podem ser desmarcados no histórico. Abrir WhatsApp/e-mail não comprova entrega; baixe e anexe o PDF e conclua o envio no aplicativo. Seleções em lote respeitam o bloco e canal escolhidos.

Atualize com o programa parado, faça backup de dados e mescle todos os arquivos desta pasta na instalação existente. Não exclua dados. Abra novamente e pressione Ctrl+F5. Extensão permanece na versão 1.16.1.

## Correção 1.23.3 — Mesa identificada pelo percurso e ficha conferida

Diagnóstico real de Tiradentes do Sul: IA retornou Marcon Marcelo Pilger e citação literal com cargo; validação nome/cargo/fonte passou, mas primary=false do leitor colocou a página Mesa em role other e bloqueou vigência presumida sem ano. Isso era erro do programa, não falta de nome pela IA.

Agora o programa reconhece Mesa/Presidência pelo link observado e pela identificação da página, sem depender somente do sinal heurístico do conteúdo. Mantém exigência de citação literal/nome/cargo e controles de fontes/ano. Se o trecho principal não trouxer o nome, o texto completo lido também é considerado na checagem de período antigo. Ao identificar nome e um único link observado da ficha correspondente, confere essa ficha antes de encerrar. Sem nome inventado, endereço suposto ou exceção por município. Limites de chamadas/páginas/tempo continuam valendo; ficha não conferida por limite/falha fica parcial.

Payload da IA evita repetir mainText e deduplica contatos institucionais, enviando somente trecho curto por contato. Evidência completa continua disponível para validação local. Diagnóstico registra motivo de classificação, complementação da ficha e caracteres enviados por chamada. Não garante quantidade/custo de tokens reais, pois novos acessos e resposta do modelo variam.

Seu prompt personalizado e sua chave são preservados; não precisa reescrever prompt para aplicar esta correção. Atualizar pacote completo, reiniciar servidor e executar a extração novamente. Leia GUIA-EXTRACAO-1.23.3.html.

## Correção 1.23.2 — ano entre cargo/nome e telefone com ponto

Corrigida validação de trechos como Presidente em Exercício / 2026 — Vereadora — Nome. Anos legítimos entre cargo e nome não fazem a prova ser rejeitada; períodos antigos, vice, pessoas vizinhas, legislatura e data de publicação continuam bloqueados como antes. Aceita telefone publicado como (55) 9.9166-5758 para o valor normalizado (55) 99166-5758, sem confirmar WhatsApp.

Página individual iniciada pelo link explícito Presidente/Presidência pode servir como fonte do telefone próprio mesmo quando visitada como Mesa. Contatos institucionais continuam comparados e descartados individualmente. Novo diagnóstico separa nome não retornado pela IA e candidato rejeitado, com citação, verificações e tamanho do texto lido. Versão do diagnóstico corrigida (1.22 era rótulo fixo desatualizado do exportador).

Seu prompt personalizado é preservado. Cole somente regras de busca; o programa já envia município, UF, site e ano no payload e exige seu próprio schema de navegação. Outro JSON em SAÍDA não muda o formato aceito pelo programa. PROMPT-ESTRATEGIA-1.23.2.txt traz opção compatível. Leia GUIA-EXTRACAO-1.23.2.html. Reinicie o servidor após mesclar o pacote completo na instalação ativa; preserve dados. Ajustes anteriores de iniciador e prompt continuam incluídos.

## Correção 1.23.1 — painel e servidor atualizados juntos

Se o painel mostrar Rota não encontrada, o servidor em execução não oferece /api/extractor-prompt. Pode ser processo antigo ainda aberto ou atualização incompleta do app.py. Trocar só web/index.html não cria uma API no servidor antigo.

Este pacote completo inclui app.py com GET/POST do prompt, extractor_prompt.py, leitor Node e interface corrigida. O iniciador confere versão/capacidade antes de reutilizar servidor e faz consultas locais sem passar pelo proxy do Windows/VPN. Servidor ativo sem correspondência com o registro da pasta gera aviso explícito; não é considerado parado silenciosamente.

Leia GUIA-RECUPERACAO-1.23.1.html. Conclua ou cancele trabalhos, feche as abas, copie TODO o conteúdo de mvp-jp-minato para a instalação ATUAL preservando dados e reinicie o servidor para carregar o Python novo. Se não conseguir encerrar pelo controle, salve os outros trabalhos e reinicie o Windows DEPOIS de copiar o pacote. Ctrl+F5 sozinho atualiza somente a página e não reinicia Python. Não inicie pela cópia extraída temporária.

## Atualizar sem perder os dados

1. Extraia este ZIP primeiro em uma pasta temporária. Pause os trabalhos no MVP. Abra **PARAR-JP-MINATO.vbs** do pacote e, se solicitado, escolha a pasta do programa atual (por exemplo E:\JP-Minato). Aguarde a confirmação de parada. Fechar apenas a aba do navegador não encerra o servidor. Na versão nova, o iniciador também tem o botão Parar servidor para atualizar.
2. Faça uma cópia de segurança da pasta **dados inteira**.
3. Copie os arquivos da pasta temporária para a pasta atual do programa, substituindo os arquivos do aplicativo e **preservando dados**. Não execute dentro do ZIP nem copie uma pasta dados vazia sobre a antiga.
4. Abra **ABRIR-JP-MINATO.vbs** com dois cliques. Use **Abrir JP Minato**. A instalação existente de Python continua sendo usada; primeira preparação requer internet.
5. No navegador, pressione Ctrl+F5 e confira **MVP 1.25**.
6. Abra `chrome://extensions`, recarregue **JP Minato** e confira **1.16.1**. Se a pasta mudou, carregue sem compactação **extensao-chrome** deste pacote. São necessárias as novas permissões de navegação. Inicie capturas novas pelo cadastro; vínculos antigos expiram ao reiniciar.

Inclui Pillow para leitura de WebP (correção do brasão 1.16.1 já incorporada). O iniciador instala automaticamente a dependência ausente; mantenha internet nessa primeira preparação. O pacote não contém dados pessoais, banco de produção, credenciais, ambiente Python ou node_modules.

## O que mudou na versão 1.23 — Calibração e prompt editável

- **Extrator de contatos → Prompt da IA**: cole/edite a estratégia, clique Salvar prompt e execute uma nova extração com OpenAI/API ativa. Não exige reiniciar nem atualizar o programa para os próximos ajustes de estratégia. Sem API OpenAI ativa, o prompt não é usado.
- Prompt persistido no banco local em dados. Recarregar salvo descarta o rascunho; Restaurar padrão volta à calibração incluída nesta versão; histórico mantém dez versões anteriores. Encerre/cancele a fila antes de salvar. Revisões evitam sobrescrita entre duas janelas. Configurações e chaves permanecem separadas do prompt.
- Prioriza identificação explícita do Presidente na Mesa principal, cartões de vereadores em exercício ou página inicial. Aceita nome antes/depois do cargo, incluindo “Nome / Vereador em Exercício / Presidente”. Vice-Presidente não serve, nem citação recortada omitindo Vice. A IA segue a ficha vinculada ou procura o mesmo nome em Vereadores.
- Mesa/título atual têm prioridade sobre biografia antiga divergente, com instrução de registrar a divergência. Documentos, atas, notícias e histórico de ex-presidentes deixam de servir como prova da presidência e de entrar na rota sugerida do fluxo OpenAI. Mesa principal única sem ano tem vigência presumida; várias composições exigem o ano solicitado. Legislatura não prova período da presidência.
- Contatos institucionais continuam primeiro; os iguais são descartados individualmente do presidente. Fone/celular não comprova WhatsApp. Diagnóstico registra revisão e identificação do prompt utilizado, sem expor chave ou texto completo do prompt.
- Formato JSON, navegação por links observados e validações locais continuam ativos. Editar estratégia não altera esses controles: mudanças futuras na estrutura do programa ainda podem exigir atualização.

Leia **GUIA-CALIBRACAO-1.23.html**. A extensão continua **1.16.1**, incluída sem mudança nesta atualização. Atualize o aplicativo completo, incluindo extractor_prompt.py e contatos-extrator/engine.cjs, preservando dados. Os testes usaram respostas OpenAI simuladas; não houve chamada paga ou uso da chave do usuário.

## O que mudou na versão 1.21

- Fluxo Mesa Diretora/Presidência → nome do presidente → ficha vinculada ou procura pelo nome completo na lista de Vereadores/Parlamentares → contatos da mesma pessoa. Comparação ignora acentos, caixa e espaços extras. Abreviação/nome parecido não basta; mais de uma ficha correspondente fica sem seleção automática.
- Mesa principal única sem ano da presidência pode ser aceita como **vigência presumida — página principal sem ano**. O programa não inventa período nem apresenta 2026 como comprovado nesse caso. Legislatura 2025–2028, data de publicação e rodapé não impedem essa presunção nem comprovam o ano da presidência.
- Havendo várias composições encontradas, exige a composição do ano solicitado ou período que o inclua. Ano explicitamente antigo não é aceito. Se não houver identificação suficiente, mantém presidência pendente. Esta regra substitui a exigência absoluta de comprovação de ano descrita nas versões anteriores.
- Fonte da Mesa e URL da ficha continuam separadas. A própria página de Presidência pode ser a ficha com telefone/e-mail. Nome e contatos aceitos substituem o bloco do presidente; dados anteriores diferentes continuam no histórico.
- Mantém exclusão individual de contatos iguais aos da Câmara. Celular/Fone não é WhatsApp confirmado. Contatos institucionais continuam sendo coletados quando a presidência ficar pendente.
- Extensão **1.16.1** incluída: menus em links de telefone, limpeza de tel:/DDI e mailto:/parâmetros, captura restrita ao município/aba. Recarregue em chrome://extensions depois de substituir os arquivos da pasta usada pela extensão.

Leia **GUIA-COLETA-1.21.html**. Instalação local do escritório, sem mudar banco/VPN. A ausência de ano é uma presunção autorizada pelo usuário, não garantia de que o site esteja atualizado. A coleta observa as páginas alcançadas dentro dos limites configurados.

## Correção 1.20.1 — captura de telefone e e-mail

- Extensão 1.16.1: menus Telefone da Câmara e Telefone do presidente também aparecem no botão direito de links, sem precisar selecionar texto.
- Link tel: tem prioridade sobre o texto visível. tel:+55(55) 99997-4126 é salvo como (55) 99997-4126 no telefone escolhido. Remove parâmetros de ramal/consulta; valida o número nacional e mantém conferência de DDD. Não confirma WhatsApp pelo link de ligação.
- E-mails removem mailto: (inclusive maiúsculas), codificação de URL, prefixos Email:/E-mail: e parâmetros de assunto/corpo/cc. Grava somente o endereço no destinatário escolhido; não aceita vários e-mails numa captura.
- A rota/aba/município autorizado continua obrigatório. E-mail do presidente substitui; Câmara acrescenta sem duplicar.
- Atualize arquivos do MVP e da pasta extensao-chrome, recarregue a extensão em chrome://extensions e inicie uma nova captura pelo município correto. A instalação desta correção usa o mesmo procedimento acima, sem apagar dados.

## O que mudou na versão 1.20

- Coleta por OpenAI API no programa local do escritório: Extrator de contatos → Configurações → OpenAI, ano de referência, modelo e chave do extrator. Ative Usar API de IA e salve. Comece testando um município antes de executar um lote. A chave de restauração de fotos não é reaproveitada automaticamente.
- Presidência somente com trecho e fonte observados que comprovem nome, cargo e período da Mesa/Presidência incluindo o ano solicitado. Legislatura, rodapé e data de atualização não comprovam presidência.
- Sem comprovação, os campos atuais do presidente ficam vazios e a observação é registrada; contatos institucionais continuam sendo coletados. A coleta validada substitui o bloco do presidente, inclusive correções manuais. Valores anteriores diferentes ficam em Dados anteriores da presidência, no cadastro. Essa regra substitui a preservação de e-mail anterior descrita no histórico 1.19 para a nova coleta validada.
- Telefones, WhatsApps e e-mails do presidente iguais aos institucionais são descartados individualmente. Os contatos próprios distintos são mantidos. A comparação inclui números dentro de links e os contatos da Câmara já cadastrados.
- Fonte, trecho, ano e observações aparecem na tela Contatos. Falha/recusa/resposta incompleta da API aproveita somente contatos institucionais comprovados e deixa presidência pendente.
- Modelo inicial gpt-4.1-mini configurável, chave por provedor e compatibilidade Gemini mantida. As validações locais também se aplicam aos resultados sem OpenAI. A API pode gerar cobrança na conta do provedor.

Leia **GUIA-COLETA-1.20.html**. A atualização se destina ao MVP local do escritório; não exige mudar VPN, domínio ou banco de dados. Preserve a pasta dados da instalação ativa. Extensão permanece 1.16.0.

## O que mudou na versão 1.19

- E-mail do presidente aceita um único endereço. Nova captura ou e-mail válido extraído substitui o anterior, inclusive correção manual anterior desse campo. E-mails da Câmara continuam acumuláveis. Extração sem e-mail válido não apaga o contato.
- Salvar no cabeçalho grava e mantém a janela aberta. Fechar e Esc aguardam o salvamento antes de fechar; em caso de erro preservam a janela e o texto digitado.
- Cancelar descarta somente alterações ainda não salvas. Não desfaz capturas da extensão nem salvamentos já confirmados.
- Edição manual real e revisão ficam registradas separadamente: fundo cinza na linha por 24 horas, indicação relativa e data/hora na descrição. Abrir/fechar sem alterar nada não gera edição.
- Botão Marcar como revisado para conferência sem mudança. Extrações automáticas, envios e restauração não reiniciam o prazo de edição manual.

Leia **GUIA-NOVIDADES-1.19.html**. O destaque passa a considerar os novos registros feitos a partir desta versão: datas antigas não são inventadas. A extensão continua 1.16.0; atualize seus arquivos para receber as instruções corrigidas sobre e-mail único.

## O que mudou na versão 1.18

- Filtros recolhidos por padrão; DDD continua no cadastro e nos filtros, sem coluna na lista.
- Números nos botões da Câmara e do presidente, com ícone de WhatsApp quando confirmado. Verificação continua acessível pelo painel.
- Em Enviar PDF, link aberto fica verde e recebe indicador individual; envio registrado tem símbolo separado e pode ser desmarcado no histórico.
- Destinatário segue o vínculo do contato. Celulares têm preferência por destinatário; fixo aparece se não houver celular elegível.
- Contatos iguais entre Câmara e presidente recebem aviso vermelho, sem exclusão automática.
- Quatro modelos configuráveis por canal/destinatário, assunto e corpo de e-mail, variáveis e prévia. Abra Configurações para personalizar.
- Site da Câmara, Mesa Diretora e Perfil do presidente na tela Contatos iniciam captura vinculada ao município.
- Mapa busca somente as rotas na abertura, reutiliza malha já carregada e associa municípios por índices; não redesenha camadas com o mapa fechado.

Leia **GUIA-NOVIDADES-1.18.html**. A pasta dados existente deve ser preservada. Nenhuma mensagem ou anexo é enviado automaticamente; WhatsApp e e-mail ainda exigem concluir o envio/anexar PDF no aplicativo correspondente. Extensão permanece 1.16.0.

## O que mudou na versão 1.17

- **Pasta dados como acervo central:** caminhos digitados/colados também copiam as fotos para dados. Originais e tratadas ficam organizadas por município/ano; importação idêntica reaproveita a cópia. Conteúdo novo preserva as cópias anteriores. A associação usa nome/caminho relativo, mantendo os pares e IDs existentes quando a identidade coincide.
- **Arquivos antigos:** abra **Armazenamento / reunir arquivos** e clique **Reunir arquivos já cadastrados em dados**. O programa copia originais, tratadas, brasões atuais/anteriores, PDFs e arquivos da fila/histórico da IA que ainda estejam fora. Modelos PDF utilizados também ficam em dados. Progresso e relatório indicam ausentes, falta de acesso e alterações concorrentes; origem preservada. Somente arquivos encontrados e copiados com verificação de conteúdo passam a usar o novo caminho.
- **Backup e transferência:** depois de concluir a coleta sem pendências, a pasta dados inteira reúne banco, mídia e configurações. O acervo passa a preferir os arquivos da cópia local de dados quando a instalação antiga ainda existe. Credenciais protegidas pelo Windows ainda podem exigir nova autorização em outro usuário/computador; os arquivos estarem juntos não muda essa proteção.
- **Brasão:** incorporada a correção 1.16.1 do leitor PNG/JPEG/WebP e transparência, incluindo upload manual. Extensão permanece 1.16.0. Inicie nova captura depois de reiniciar o servidor.

Leia **GUIA-ARMAZENAMENTO-1.17.html** para reunir os arquivos antigos e fazer a conferência.

## Funcionalidades da versão 1.16 mantidas

- **Agenda Google:** exportação CSV por selecionados, filtros ou município aberto; conexão OAuth e prévia antes de gravar. Câmara e presidente ficam em contatos distintos. A sincronização usa identidade persistente e recurso Google para atualizar sem criar cópias pelo simples nome/ano alterado. Correspondências preexistentes por telefone/e-mail exigem escolha. Alterações manuais conflitantes são preservadas para revisão.
- **Brasão:** abre `brasão MUNICÍPIO UF` no Google para escolha manual, sem restrição à Wikipédia. Aceita imagens públicas de outros sites e SVG suportado convertido em PNG transparente, preservando fonte, versão anterior e proporções. Use o botão direito sobre a imagem na rota aberta pelo MVP. Para blob/data, miniaturas insuficientes ou bloqueio, abra a imagem original ou faça upload manual.
- **Enviar PDF:** números e e-mails utilizáveis vêm marcados. Desmarque os que não quiser. **Enviar e registrar selecionados** abre um destinatário por clique; use o botão do próximo para continuar. O registro é operacional, declarado pelo clique: não comprova envio, anexo, entrega ou leitura. E-mails são individuais. Baixe e anexe o PDF no WhatsApp/e-mail. Desmarque um registro no histórico para corrigir; a trilha fica preservada.
- **Verificador com número exclusivo:** protótipo com fila persistente, Google obrigatório antes da consulta, deduplicação, pausa/cancelamento, cache de 30 dias e bloqueio de conta divergente. Não envia mensagens, PDFs ou convites. Formatos inválidos ficam separados; falhas são inconclusivas. A janela do validador e WhatsApp Web devem ficar abertos. Consulte o guia antes de usar.
- **Segurança da extensão:** cada captura fica presa ao município, à finalidade e à aba/percurso iniciado no MVP. Links internos e abas filhas comprovadas podem continuar; endereço digitado/colado, aba independente, clone sem vínculo ou saída da rota bloqueiam a gravação. Contatos não podem usar a aba de brasões. Portais compartilhados respeitam o caminho municipal quando identificável; situações ambíguas exigem reabrir corretamente.

Leia **GUIA-NOVIDADES-1.16.html** para conectar Google e preparar o protótipo. O guia de VPN continua em **GUIA-ACESSO-REMOTO.html**. Autorizar o endereço da VPN no ícone da extensão continua necessário no computador remoto.

## Google Contatos: nomes e histórico

- Câmara: `CM MUNICÍPIO UF`.
- Presidente: `CM MUNICÍPIO UF NOME DO PRESIDENTE ANO ATUAL` (ano calculado).
- Correção do nome, telefone ou ano da mesma pessoa atualiza o mesmo contato. Para outra pessoa, use **Novo presidente do município aberto**: mantém o contato anterior no Google com nome/ano anteriores, guarda dados anteriores no histórico local e limpa nome, partido, mandato, telefones, WhatsApp, e-mail e perfil do cadastro atual. Depois preencha o nome e os contatos da nova pessoa e confira a prévia.
- CSV serve para importação manual; importar novamente não garante atualização sem duplicar. Use a sincronização por API para manter o vínculo.
- Nenhum contato é excluído automaticamente. Sincronização é iniciada pelo usuário do MVP para o Google; não existe sincronização bidirecional instantânea.
- Resultado de criação perdido por timeout fica incerto. A próxima prévia reconcilia pelo identificador. Sem confirmação no Google, não recria automaticamente. Confira a agenda e aguarde a propagação; não remova identificadores nem force duplicação.

## Validação desta versão

199 testes automatizados passaram, incluindo centralização e correção de brasões. Eles cobrem os fluxos anteriores e agenda, revisão/etag, criação incerta, proteção entre abas/municípios, imagens públicas, fila Google-primeiro e registros reversíveis. Teste real do navegador cobre seleção padrão, preservação de desmarcação, bloqueio de popup, sequência de destinatários, correção do histórico, CSV e fila aguardando Google. Aplicativos externos foram simulados: nenhuma mensagem foi enviada, nenhum contato Google real foi criado e nenhum número real foi consultado.

OAuth/People API e WhatsApp Web precisam de teste com as suas contas. DPAPI, menus nativos, permissões e atalhos exigem instalação no Windows; não foram executados nativamente neste ambiente. WA-JS é terceiro, não API oficial Meta; o protótipo não garante compatibilidade contínua, ausência de restrições ou consultas ilimitadas.

## Histórico técnico das versões anteriores

As seções abaixo são registros anteriores e não substituem as instruções de atualização e funcionalidades da versão 1.16 acima.

## Histórico: novidade 1.13 — restauração e colorização pela API da OpenAI

### Atualizar

Feche o programa, faça backup de dados inteiro e extraia todos os arquivos deste ZIP na pasta atual, substituindo os arquivos do aplicativo e preservando dados. Abra INICIAR.bat e pressione Ctrl+F5. Confira MVP 1.15. Nenhuma dependência Python nova. A extensão deste pacote está na versão 1.14.0; recarregue em chrome://extensions.

### Configurar e testar

1. Abra **Restauração IA** no cabeçalho e expanda **Chave e configurações**.
2. Cole sua chave da API da OpenAI nesse campo protegido; não envie a chave pelo chat. API exige conta com acesso ao modelo/créditos; a assinatura do chat não configura automaticamente o acesso do aplicativo.
3. Escolha modelo, qualidade, dimensões e limite de fotos por lote. Modelo inicial: gpt-image-2.5-sunburst. A disponibilidade será conferida na sua conta.
4. Clique **Salvar configuração** e **Testar chave sem gerar imagem**. Esse teste lista modelos, sem restaurar uma foto; a edição real ainda pode ser recusada por permissão ou cota.
5. Abra um município → **Criar PDF / fotos** → **Restaurar esta foto / teste**. Confira o resumo e clique **Iniciar restauração pela API**. Comece por uma foto para verificar qualidade e consumo.

No Windows, a chave fica criptografada com DPAPI em dados/credenciais e só pode ser lida pelo usuário/computador correspondente. O backup contém a credencial criptografada; em outro computador, cadastre novamente. A tela nunca devolve o segredo salvo. Neste ambiente Linux não foi executado DPAPI nativo; em sistemas não Windows, use OPENAI_API_KEY no backend.

### Município e selecionados

**Restaurar município com IA**, na preparação do PDF, coloca na fila as fotos marcadas **Incluir no PDF** que ainda não têm tratada. Na lista, marque municípios e use **Restaurar fotos dos selecionados**; a seleção inclui outras páginas. Cada foto tem botão próprio para teste ou refazer. Tratadas existentes são ignoradas por padrão; refazer é uma nova chamada paga e conserva a versão anterior.

O padrão de tratamento enviado inclui colorização, limpeza de degradação, rosto/idade/expressão preservados, pele natural sem chuvisco artificial, definição, iluminação suave, fundo branco, enquadramento 4:5 de meio tórax para cima e roupas de época. As cores dos trajes variam discretamente. Orientações adicionais podem ser cadastradas por configuração ou por lote/foto. A API não conhece este histórico do ChatGPT; o padrão é enviado explicitamente. Não há garantia de resultado idêntico ao chat nem recuperação fiel de detalhes ausentes.

Cada original vai como referência individual. Saída PNG, mantendo o nome base da foto e o ID do par (uma extensão JPG pode virar PNG). Arquivos ficam em **dados/imagens_municipais/CODIGO/ANO/restored-ia/**; originais permanecem intactos. A tratada é associada automaticamente e o PDF fica pendente de nova geração. Confira visualmente e clique **Gerar PDF final**; não exige confirmar pares um a um.

### Fila e cobrança

A fila roda em segundo plano, uma foto por vez, sem travar a lista ou os contatos. Mostra andamento, município, foto, erro e consumo retornado pela API. Limite inicial: 50 fotos por lote, configurável. Não há estimativa monetária automática; consulte o consumo/faturamento da sua conta. API tem cobrança por uso, inclusive resultados que você reprova e novas gerações ao refazer.

**Pausar fila** e **Cancelar pendentes** impedem novas consultas; não interrompem requisição já enviada. Ao reabrir o programa, a fila começa pausada: use **Continuar fila**. Não inicie um lote novo para retomar uma fila antiga sem conferir; o programa orienta continuar ou cancelar os pendentes.

Erro pausa a fila. Timeout, interrupção durante chamada ou resposta inválida ficam como **Resultado incerto**: não são repetidos automaticamente, pois pode ter ocorrido cobrança. Confira a conta antes de usar **Refazer / nova chamada**. Se o original/par mudou durante a geração, o resultado fica guardado como conflito e não sobrescreve a alteração.

### Verificação

124 testes automatizados passaram, sem testes ignorados. Multipart da Image API testado com servidor HTTP controlado, fila, reinício, falhas, segredo oculto, limite, originais, versões, associação e PDF final. Navegador verificou duas cidades, configuração, teste/individual, PDF, refazer e ignorar tratadas, sem erros JavaScript. Os 792 cadastros originais foram preservados. Nenhuma chamada paga a uma conta OpenAI real foi feita; a qualidade e o acesso reais precisam do teste no seu computador.

## Correção 1.12.2 — captura preenche os campos automaticamente

Ao escolher Salvar como na extensão, o dado é gravado e o MVP recebe automaticamente a atualização do município correspondente. O botão Atualizar contatos capturados foi removido. Não precisa voltar à aba para iniciar uma recarga de toda a base.

O campo escolhido recebe o valor capturado. Rascunhos de outros campos e observações ficam preservados. A resposta de uma captura para outro município atualiza sua linha, sem mudar o cadastro que você abriu. O preenchimento ocorre depois da confirmação do banco; não significa envio de mensagem.

Atualize com programa fechado e backup integral de dados. Extraia o pacote na pasta atual mantendo dados, abra INICIAR.bat e pressione Ctrl+F5. Confira MVP 1.15. A extensão permanece 1.11.2; abra a captura pelo município para vincular a aba do site.

115 testes passaram. Navegador com backend real verificou preenchimento automático sem recarga completa, rascunho preservado, destino correto e ausência do botão; zero erros JavaScript. Menu nativo no Chrome do Windows depende da instalação local.

## Correção 1.12.1 — salvar contatos e continuar trabalhando

Salvar contatos agora grava e devolve apenas o cadastro alterado. Atualiza sua linha e seus dados sem recarregar toda a base, fotos e histórico. Durante a gravação, somente o botão Salvar desse município fica indisponível; você pode navegar e trabalhar em outro cadastro.

A confirmação aparece depois da resposta do banco. Se continuar digitando antes dela, as novas edições ficam como rascunho para o próximo salvamento. Trocar de município não faz a resposta atrasada modificar a tela do outro cadastro. Falhas preservam o formulário e mostram aviso para nova tentativa.

**Instalar:** feche o programa, faça backup da pasta dados inteira, extraia todos os arquivos deste ZIP na pasta atual substituindo os arquivos do aplicativo e mantendo dados. Abra INICIAR.bat, pressione Ctrl+F5 e confira MVP 1.15. Extensão continua na versão 1.11.2.

**Verificação:** 114 testes automatizados passaram, incluindo retorno HTTP apenas do município salvo. Navegador real verificou resposta atrasada, navegação durante a gravação, novas edições preservadas, falha visível, persistência e ausência de recarga completa; zero erros JavaScript. Banco original enviado não foi alterado. O tempo real ainda depende do disco e de possíveis bloqueios externos do banco.

## Atualização 1.12 — fotos por município, sites e WhatsApp

**Para atualizar:** feche o programa e faça uma cópia de segurança da pasta **dados inteira**. Extraia todos os arquivos deste ZIP na pasta atual do JP Minato, substituindo os arquivos do aplicativo e mantendo dados. Abra **INICIAR.bat**, pressione **Ctrl+F5** e confira **MVP 1.15**. O ZIP contém os arquivos diretamente, sem uma pasta extra. A extensão permanece na versão **1.11.2**; se já usa essa versão, não mudou nesta atualização.

### ZIP e importação de fotos

- Marque os municípios e clique em **Baixar ZIP dos selecionados (N)**, na lista ou em Exportar. Inclui municípios selecionados em outras páginas, fotos originais, progresso e resumo das pendências.
- Cada município ganhou um código permanente, como **JP-M000001**, visível junto ao nome e pesquisável. É um código interno desta base; não é código IBGE ou TSE. Reimportar a planilha mantém os códigos existentes.
- O ZIP organiza as originais em **Fotos_originais_selecionados/JP-M000001_NOME_RS/**, com manifesto e nomes das fotos preservados. Para devolver as tratadas, mantenha o código da pasta municipal e os nomes dos arquivos.
- Em **Importar → Pastas por código municipal**, escolha Originais ou Restauradas e selecione a pasta principal. A importação começa imediatamente após a escolha; também pode informar um caminho local. Pastas antigas são reconhecidas quando UF e município identificam um cadastro sem ambiguidade.
- As imagens importadas por esse fluxo são copiadas para **dados/imagens_municipais/CODIGO/2004/**. Não dependem da permanência da pasta externa. Arquivos idênticos não duplicam fotos. Por padrão, arquivos diferentes com o mesmo nome ficam como conflito no resumo; a opção explícita de substituir guarda a versão anterior.
- Códigos desconhecidos/duplicados, manifestos divergentes e imagens sem município identificado aparecem como pendências. Nenhum ZIP vazio é anunciado como contendo fotos.

### Sites encontrados

A busca de sites agora grava automaticamente o endereço encontrado no cadastro, atualiza os atalhos e registra a origem e o endereço anterior. Não exige aceitar cada resultado. Ao abrir a nova versão, sugestões pendentes de buscas anteriores também são aproveitadas, respeitando correções manuais posteriores. Uma extração de contatos que encontra outro domínio ainda usa o fluxo específico de conferência desse domínio. Google e sites podem bloquear o motor; erro ou ausência de resultado não gera site salvo.

### Conferência de WhatsApp

Abra **Conferir WhatsApp** no cabeçalho. Configure uma integração que você já tenha disponível:

- **Evolution API:** URL do servidor, nome da instância e API key. A instância deve estar conectada ao WhatsApp.
- **Z-API:** ID da instância, token da instância e Client-Token, com instância conectada.

O serviço externo não está instalado nem conectado pelo pacote. A integração começa desativada. Salve, use **Testar conexão** e habilite as consultas. Marque a opção automática para adicionar telefones novos e pendentes em segundo plano enquanto o MVP estiver aberto. A lista oferece ações para selecionados/filtrados e filtro por resultado. Desmarcar a ativação pausa novas consultas; uma requisição em andamento termina dentro do timeout.

A fila fica no banco e é retomada ao reabrir com integração habilitada. Deduplica telefones da Câmara e do presidente, preserva confirmações manuais e não consulta novamente resultados conclusivos automaticamente. **Conferir novamente** permite nova consulta específica. Há até três tentativas automáticas para falhas, com espera crescente; o rastreamento de novos números ocorre a cada 30 segundos. Números inválidos ou DDD divergente sem exceção conferida precisam de correção.

Resultado positivo indica conta encontrada na consulta e mostra data/método; negativo conclusivo mantém o telefone e remove seu atalho de WhatsApp; erro, sessão desconectada ou resposta inválida ficam inconclusivos. Não comprova titular online nem entrega/leitura e não envia mensagens de teste. Links completos e contatos anteriores são preservados.

Credenciais ficam no banco local, separadas da chave Gemini, e não são devolvidas à tela ou exportadas com contatos. **O backup da pasta dados contém essas credenciais.** Nenhuma credencial real está no pacote.

**Verificação:** 113 testes automatizados passaram. Interface testada em navegador: importação por código, ZIP, sites automáticos, fila WhatsApp, filtros e persistência, sem erros de JavaScript. Os 792 cadastros da cópia de teste foram preservados e o banco original permaneceu intacto. Consultas WhatsApp foram testadas com servidor HTTP controlado; a sua instância real precisa ser configurada e testada.

## Histórico: correção 1.11.2 — links na extensão

- Menus E-mail da Câmara/presidente aparecem ao selecionar texto e ao clicar com direito num link. O destino mailto é usado, mesmo quando o texto do botão não contém o e-mail; assunto, corpo e cc não são cadastrados como endereço.
- Menus WhatsApp da Câmara/presidente usam o destino real do link. Recriação automática dos menus ao atualizar/iniciar o Chrome e botão **Recriar menu do botão direito** no popup da extensão.
- Campo de WhatsApp aceita número ou link individual reconhecido. Link completo colado no campo preserva seu endereço/parâmetros; telefone gera wa.me. Links sem número não inventam telefone. Links capturados continuam associados ao destinatário correto.
- O atalho abre a conversa; **anexe o PDF manualmente** para enviá-lo. O endereço salvo não inclui o arquivo PDF e não comprova que a conta está ativa.

**Instalação obrigatória da extensão atualizada:** após copiar o pacote mantendo dados e reiniciar o MVP, abra chrome://extensions, encontre JP Minato, clique em Recarregar e confirme **versão 1.11.2**. Se a extensão aponta para outra pasta, carregue sem compactação a pasta extensao-chrome desta instalação. Abra uma nova captura pelo município no MVP para vincular a aba; clique com direito sobre o link e escolha Câmara ou presidente. Se o menu não aparecer, clique no ícone da extensão → Recriar menu do botão direito. Botões que executam somente JavaScript, sem um link real, não fornecem linkUrl; nesse caso selecione o texto/endereço disponível ou cadastre manualmente.

94 testes passaram, incluindo menu/link com API Chrome simulada e gravação real de mailto com parâmetros/decodificação. JavaScript e campo WhatsApp com número, link completo, parâmetros e link sem número foram verificados. Menu nativo instalado no Chrome do Windows não foi executado neste ambiente; conferir a versão e a recarga é necessário. Correção SQLite e retomada 1.11.1 preservadas.

## Correção 1.11.1 — fila interrompida por database is locked

- Conexões SQLite fechadas explicitamente ao fim de cada transação; rollback e liberação também em erro.
- Banco usa WAL para permitir leitura da lista enquanto a fila grava resultados, com espera de até 15 segundos por conexão, novas tentativas limitadas nas gravações da fila e serialização das configurações.
- Falha isolada de um município fica no resultado desse município; a fila continua com os restantes. Falha geral mostra o motivo na tela e sinaliza os ainda não processados como interrompidos.
- **Retomar não processados**, no painel da fila, inicia somente os municípios que ficaram pendentes/interrompidos/cancelados. Resultados concluídos e sites para conferir são preservados; erros individuais já processados ficam para nova ação específica.
- Filas antigas com erro deixam de exibir municípios presos em Em extração depois de reiniciar.

Para aplicar: feche todas as janelas do programa/INICIAR.bat; faça backup da pasta **dados inteira**, com o programa fechado. Extraia este ZIP na pasta atual mantendo dados. Abra INICIAR.bat e pressione Ctrl+F5. Confira MVP 1.15; em Extrator de contatos → Fila e resultados, clique em **Retomar não processados** na fila desejada. O motor Node permanece o mesmo.

Não apague arquivos empresa.sqlite-wal ou empresa.sqlite-shm manualmente. Com o programa fechado, copie a pasta dados completa. Se outro programa mantiver o banco bloqueado, a tela mostrará o erro; a correção não remove bloqueios externos à força.

93 testes passaram, incluindo fila de 333 com leitor persistente, bloqueio temporário de outro gravador, consultas da interface e edição manual simultânea; conexão encerrada, rollback, falha isolada, estados de filas antigas e retomada seletiva. JavaScript verificado e cartão de erro/retomada conferido com DOM simulado. Pesquisa pública não foi usada como teste do banco.

## Novidades da versão 1.11

- Filtro **Site da Câmara → Sites pendentes / com erro** e botão **Buscar sites pendentes em lote (N)**. Considera todos os resultados dos filtros, incluindo outras páginas, e preserva a fila/progresso existente.
- **Buscar sites dos selecionados (N)** processa somente os pendentes marcados que também pertencem aos filtros atuais. Sites já conferidos/validados saem da pendência, mesmo com um status antigo de extração.
- Sem site cadastrado, o atalho da Câmara passa a ser **Abrir busca Google**, com município e UF da própria linha. Mesa Diretora e perfil do presidente continuam separados. A busca manual funciona sem motor Node ou chave de IA.
- Botão direito sobre um link de WhatsApp: **JP Minato — Salvar como → WhatsApp da Câmara (link)** ou **WhatsApp do presidente (link)**. Links com número válido são salvos diretamente como telefone e endereço associado; seus parâmetros são preservados.
- Somente situações que precisam de uma escolha abrem a tela de associação: endereço anterior diferente, DDD divergente ou link individual sem número. Para estes últimos, escolha um telefone já cadastrado ou salve somente o link do contato. Não há busca automática de número nem captura de grupos/canais.
- Atalhos na lista, no cadastro, no mapa e em Enviar PDF usam o endereço salvo daquele contato. Reimportar, acrescentar telefone ou atualizar o extrator preserva os links capturados. Abrir/capturar um link não registra envio nem comprova conta ativa.

**Atualizar:** feche o programa, faça backup de **dados** e copie os arquivos deste pacote para a pasta atual, mantendo sua pasta **dados**. Abra INICIAR.bat, pressione Ctrl+F5 e confira MVP 1.15. Recarregue a extensão em **chrome://extensions** e inicie uma nova captura pelo município. Node.js 22+ e INSTALAR_EXTRATOR.bat só são necessários para a busca automática/extrator; quem já instalou na versão 1.10 não precisa reinstalar.

## Novidades da versão 1.10 — extrator integrado

O motor foi reaproveitado do projeto completo **Extrator-IA** fornecido pelo usuário: navegação pela Mesa Diretora/perfil/contatos, identificação de plataformas, 34 assinaturas e 35 regras iniciais de fornecedores, busca de endereços e síntese Gemini opcional. A interface original de lista foi substituída pela integração com os municípios do JP Minato.

### Atualização e preparação

1. Feche o JP Minato e faça backup de **dados**.
2. Copie o **conteúdo** deste ZIP para a pasta atual, substituindo os arquivos do aplicativo e preservando dados. Evite criar uma segunda pasta mvp-jp-minato dentro da antiga.
3. Abra **INICIAR.bat**, pressione **Ctrl+F5** e confira **MVP 1.15**.
4. Para usar o extrator de contatos, instale **Node.js 22 ou superior** de https://nodejs.org/ (versão LTS), incluindo npm. Feche e reabra o terminal após instalar.
5. Execute **INSTALAR_EXTRATOR.bat** na pasta do programa e aguarde a conclusão. Ele instala as dependências com npm ci; precisa de internet nessa etapa. Não exige que você digite comandos nem compile o aplicativo.
6. No JP Minato, abra **Extrator de contatos → Configurações → Testar motor**.

Os recursos de contatos manuais, TSE, fotos, ZIPs e PDFs continuam funcionando sem Node. A extensão de captura está na versão 1.11.2; recarregue-a em chrome://extensions. após reiniciar o aplicativo, abra uma nova captura pelo cadastro para refazer o vínculo da aba.

### Painel separado

O botão **Extrator de contatos** no cabeçalho abre um painel próprio com:

- **Fila e resultados**: municípios, progresso, resultado, erro, sites sugeridos e histórico das últimas filas.
- **Configurações**: simultaneidade (1–4 municípios), intervalo, tempo por página, orçamento de navegação por município, limite de requisições, Gemini opcional, modelo e chave.
- **Regras por desenvolvedor**: editor JSON de assinaturas, rotas e seletores de Mesa Diretora/perfil/contato do motor original. Regras ficam em **dados/extrator-contatos**, acompanham seu backup e não são substituídas por uma atualização do programa. A chave Gemini fica no banco local, não é devolvida para a tela nem incluída na exportação de contatos; o backup do banco pode conter essa chave.

Gemini começa **desativado**. Sem chave, a extração usa o conteúdo das páginas e as regras. Ao ativar, as chamadas usam a cota da sua conta e podem gerar custos conforme sua contratação. O modelo original é gemini-2.5-flash; contas sem acesso a esse modelo podem configurar outro identificador disponível, como gemini-3.8-flash. Consulte https://ai.google.dev/gemini-api/docs/models. Se a IA falhar, a fila informa que usou regras do site. Nenhuma chave real foi incluída neste pacote.

### Ações na lista

- **Extrair município**, em cada linha: processa apenas aquele cadastro.
- **Extrair filtrados (N)**: processa os N municípios de todos os filtros atuais, incluindo estado, DDD, setor e rota. Não se limita aos 100 da página visível. A seleção para ações em lote permanece independente.
- **Buscar sites pendentes em lote (N)**: verifica os sites ausentes, marcados como inválidos ou com erro dentro dos filtros atuais. O motor tenta validar endereços e utiliza a busca Google, domínios canônicos e alternativas do projeto original quando necessário. A fonte informada da sugestão aparece no resultado.

A fila roda em segundo plano. Você pode fechar o painel e continuar trabalhando. Há atualização periódica do progresso e da lista. **Cancelar pendentes** impede novos municípios; requisições já iniciadas terminam dentro dos limites do motor. As filas são salvas no banco. Ao reiniciar após interrupção, são marcadas como interrompidas; não retomam automaticamente.

### Conferência de sites e preservação de dados

Na versão 1.12, a busca de sites grava automaticamente Website Câmara, preservado em reimportações. Depois, use **Extrair município** para coletar seus contatos. O endereço permanece editável no cadastro. Se uma extração descobrir outro domínio, seus contatos não são aplicados até você aceitar o endereço e executar novamente.

Google pode bloquear consultas automáticas; uma falha de acesso não comprova que o site deixou de existir. O resultado também oferece **Abrir busca Google**, para consulta manual por município e UF. Nenhuma busca tem garantia de encontrar todos os sites. Prefeituras são rejeitadas pela lógica do motor; confira o endereço salvo e edite-o se necessário.

Resultados entram nos campos de origem do cadastro. Edições manuais e capturas da extensão continuam prevalecendo. Telefones/e-mails anteriores são preservados e novos valores são acrescentados. Resultado vazio ou erro não apaga um contato útil. Mesa Diretora, plataforma, confiança, notas, fontes, data e status da extração são registrados nos campos do cadastro. Fotos, PDFs, rotas, setores e histórico de contatos/envios não são substituídos. Extração não registra contato comercial nem envio.

### Adaptações e verificação

O motor Node escuta somente em loopback, exige um token do JP Minato e só acessa páginas HTTP/HTTPS públicas. Foram substituídas execuções de shell por requisições HTTP diretas com limites de tamanho, tempo e quantidade. Não são transportados cookies/sessões do projeto original, não há relaxamento global de TLS e páginas arquivadas não são usadas para identificar o presidente atual. Site bloqueado, certificado inválido ou conteúdo indisponível pode ficar pendente.

75 testes automatizados passaram, incluindo integração com o motor Node real sobre páginas locais de teste, preservação de edição manual, fila de 105 municípios, cancelamento, persistência, configuração sem exposição de chave e aceite de endereços. A interface foi testada em navegador sobre cópia de 792 cadastros, com painel/regras/configuração, extração real de páginas de teste, gravação do resultado e reabertura da fila; nenhum erro de JavaScript. O banco original enviado não foi alterado. A extração de sites públicos varia com disponibilidade/bloqueios; Gemini não foi testado com chave real.

## Histórico: novidades da versão 1.9 — correção da captura e salvamento direto

A captura agora grava imediatamente ao escolher o campo no menu **JP Minato — Salvar como**. Não abre a tela de revisão para dados válidos. Escolher **Nome do presidente** substitui o nome atual; telefones e e-mails são acrescentados, preservando os anteriores e evitando duplicação.

Corrigida a autorização das chamadas da extensão: ela envia sua identificação junto ao token da sessão. As chamadas do Chrome sem cabeçalho Origin passam a funcionar; páginas comuns continuam impedidas de escrever por essa rota. Cada aba permanece vinculada ao município escolhido.

Após resposta de sucesso do MVP, a extensão mostra **OK** no ícone e uma notificação (quando permitida pelo Chrome/Windows). O clique no ícone mostra o último resultado. Se falhar, mostra **!** e abre a explicação, sem afirmar que salvou. Formato inválido, sessão expirada ou DDD divergente não são salvos silenciosamente: confira/cadastre o número pelo MVP nesses casos.

A lista e o cadastro recebem automaticamente os dados depois da confirmação da captura. O campo escolhido na extensão é preenchido, preservando rascunhos de outros campos. A página de origem e a data/hora ficam em **Fontes dos dados capturados**. Capturar dados não registra contato realizado ou envio.

### Atualizar o programa e a extensão

1. Feche o aplicativo e faça backup de **dados**.
2. Copie o **conteúdo** de mvp-jp-minato do ZIP para a pasta atual, substituindo os arquivos e preservando dados.
3. Abra **INICIAR.bat** e pressione **Ctrl+F5** no navegador. Confira **MVP 1.9**.
4. Abra **chrome://extensions** e clique em **Recarregar** no cartão JP Minato — Capturar contatos. Confira versão **1.9.0**. Se extraiu o pacote em outro caminho, carregue a pasta extensao-chrome desse novo caminho com **Carregar sem compactação**.
5. Feche a antiga aba de captura. No cadastro correto, clique novamente em **Capturar contatos no site da Câmara** para criar o vínculo novo.
6. Selecione o texto, clique com o botão direito, escolha o campo e observe o resultado. Volte ao MVP; os dados aparecem sem clicar em Salvar no MVP.

A instalação inicial continua em chrome://extensions → Modo do desenvolvedor → Carregar sem compactação → pasta extensao-chrome. O MVP precisa permanecer aberto.

### Verificação

64 testes automatizados passaram. Em navegador com API Chrome simulada, telas e servidor reais e cópia de 792 cadastros, foram verificados salvamento direto sem Origin, persistência após recarregar, atualização automática, preservação de rascunho e erro sem falso sucesso. O menu nativo de uma extensão instalada no Chrome completo não pôde ser executado neste ambiente; a instalação no Chrome do Windows ainda exige conferência. O banco original do usuário não foi alterado.

## Histórico: novidades da versão 1.8

### Capturar dados pelo botão direito no Chrome

A extensão **JP Minato — Capturar contatos** está na pasta **extensao-chrome** deste pacote. Ela precisa ser instalada uma vez no Chrome; atualizar o aplicativo não instala a extensão automaticamente.

1. Extraia o pacote e atualize os arquivos do aplicativo, preservando **dados**.
2. No Chrome, digite **chrome://extensions** na barra de endereços e pressione Enter.
3. Ative **Modo do desenvolvedor** e clique em **Carregar sem compactação**.
4. Escolha a pasta **extensao-chrome** dentro da pasta mvp-jp-minato extraída. Não escolha a pasta do ZIP nem a pasta principal do programa.
5. Abra **INICIAR.bat**. No cadastro do município, em **Dados e contatos**, clique em **Capturar contatos no site da Câmara**. Mantenha o MVP aberto.
6. Uma nova aba passa pela conexão local e abre o site. Essa aba fica vinculada especificamente ao município escolhido. Para trabalhar em outro município, abra a captura a partir do outro cadastro; as abas ficam independentes.
7. Selecione o texto no site, clique com o botão direito e escolha **JP Minato — Salvar como**, depois uma destas opções: **Nome do presidente**, **Telefone do presidente**, **Telefone da Câmara**, **E-mail da Câmara** ou **E-mail do presidente**.
8. Na janela de revisão, confira município/UF, campo, texto e valor anterior. Corrija o texto se necessário, clique em **Conferir dados** e depois em **Salvar no MVP**. Nome diferente do atual exige marcar a confirmação de substituição; DDD divergente exige conferência. Se navegar para outro domínio, confirme que os dados ainda correspondem ao município indicado.
9. O MVP preenche automaticamente o campo escolhido, sem botão de atualização. As informações e as **Fontes dos dados capturados** aparecem no cadastro, com URL, campo, valor e data/hora.

Telefone é acrescentado sem apagar os anteriores, com validação de formato/DDD e atalho de WhatsApp não verificado. Uma confirmação manual de WhatsApp já existente é preservada. E-mails são acrescentados sem duplicar endereços, preservando os anteriores. Nome do presidente é substituído apenas com confirmação. Os dados são edições manuais, preservadas em reimportações. Capturar informação não registra contato realizado nem envio.

A aba deve ser aberta pelo botão de captura do MVP: abrir apenas o link comum do site não vincula o município. O vínculo inicial vale 10 minutos e é de uso único; a sessão de captura dura até 8 horas e termina se o MVP for fechado/reiniciado. Se houver falha ou expiração, reabra a captura pelo cadastro. O navegador não deve afirmar que salvou sem resposta de sucesso do MVP.

**Trocar município / voltar ao MVP** permite iniciar outra captura pelo cadastro correto; não altera silenciosamente o destino da captura atual. Se o dado estiver em uma imagem, ele não é texto selecionável: OCR não faz parte desta versão.

Ao atualizar os arquivos da extensão futuramente, clique em **Recarregar** no cartão dela em chrome://extensions e abra a captura novamente. Se mover a pasta do programa, carregue a extensão da nova localização. Se o Chrome for gerenciado pela empresa, a instalação pode depender das configurações do navegador.

### Rotas com número, cor e abertura pelo mapa

Cada rota tem **número fixo e cor própria**, persistidos no banco. Rotas antigas recebem essas identificações mantendo os municípios e revisões. Excluir uma rota não renumera as demais nem reutiliza seu número.

Os círculos tracejados, marcadores numéricos e lista de rotas usam a mesma cor. Municípios atribuídos usam bordas de rota; as cores internas de contato e envio de PDF mantêm seu significado. Cidades em mais de uma rota informam todos os números e nomes no popup; a borda mostra a primeira associação, ou a rota em edição quando escolhida.

Clique no **número da rota** ou em seu círculo e depois em **Abrir rota na lista**. Nas áreas sobrepostas, o popup apresenta as rotas disponíveis. O filtro usa a lista efetivamente salva, não recalcula municípios pelo raio. A lista mostra número/cor/nome da rota ativa. Outros filtros continuam combinando; se reduzirem o resultado, confira-os ou use **Limpar filtros**. Abrir a rota não marca checkboxes de ações em lote e não edita a composição nem registra contato/envio.

### Atualizar para 1.8

Feche o programa, faça backup de **dados** e copie o **conteúdo** de mvp-jp-minato do ZIP para sua pasta atual, substituindo os arquivos do aplicativo e preservando dados. Abra **INICIAR.bat**, pressione **Ctrl+F5** e confira o cabeçalho **MVP 1.8**. Instale a extensão conforme as instruções acima.

### Validação e limite do teste

62 testes automatizados cobrem os fluxos anteriores, captura com autorização, substituição, DDD, deduplicação, origem/auditoria, mudanças concorrentes e identidade persistente de rotas. As telas do mapa e de revisão, a comunicação HTTP e a vinculação de abas são verificadas em navegador com a API da extensão simulada. O ambiente de teste bloqueia os sockets exigidos pelo Chrome completo; por isso, o menu nativo com a extensão instalada não foi validado neste ambiente. O uso no Chrome do Windows deve ser conferido após instalar a extensão. Nenhum banco original do usuário foi modificado.

## Histórico: novidades da versão 1.7

### Rotas comerciais salvas no mapa

1. Abra **Mapa RS / raio**, escolha a sede central e o raio. Para um ponto livre, informe o nome do centro no campo exibido.
2. A seleção automática inclui apenas cadastros que ainda não pertencem a outra rota salva. Cidades já atribuídas continuam visíveis; a lista lateral informa suas rotas.
3. Para incluir uma cidade excepcionalmente em mais de uma rota, clique no município no mapa e use **+ Adicionar à rota**. Isso mantém sua participação na rota anterior e sinaliza a associação múltipla.
4. Clique em **Salvar rota**. O nome usa centro, raio e data de criação, por exemplo Erechim · 50 km · 11/10/2026. Rotas com o mesmo nome recebem um sufixo, sem sobrescrever.
5. Use **Nova rota / busca** para criar o bloco seguinte. As rotas salvas aparecem na lista do mapa e com círculos tracejados. Bordas roxas identificam municípios atribuídos; as cores de contato/PDF continuam com seu significado original.
6. **Abrir / editar** recupera a seleção salva. **Salvar alterações da rota** atualiza esse bloco. Ao trocar centro/raio, a seleção é recalculada; confira-a antes de salvar. **Filtrar na lista** usa os municípios efetivamente salvos.
7. **Remover rota** remove apenas o bloco. Cadastros, fotos, PDFs e histórico permanecem. A cidade só volta a ficar livre se não pertencer a nenhuma outra rota.

O programa confere novamente a sobreposição ao salvar. Se outra rota tiver sido criada desde a busca, retira os municípios recém-atribuídos, exceto os explicitamente adicionados pelo +. Edições simultâneas da mesma rota exigem reabri-la, evitando sobrescrever mudanças recentes.

**Municípios sem rota** está disponível no mapa e na lista. A cobertura conta os cadastros realmente atribuídos, os livres e as pendências de vínculo geográfico. Círculos sobrepostos não comprovam cobertura completa. O mapa permanece limitado ao RS; os demais estados seguem disponíveis na lista. Salvar rota não registra visita, contato ou envio. O raio usa distância em linha reta até a sede, sem ordenar visitas ou calcular estrada.

As rotas ficam no banco empresa.sqlite dentro de dados e acompanham seu backup. O nome usa a data local do computador onde o aplicativo é executado.

### Contatos separados e campos adicionais

**Dados e contatos** agora mostra **Dados da Câmara** e **Dados do presidente**, com seus próprios telefones, WhatsApp, e-mails e atalhos. Câmara reúne Site da Câmara e Mesa Diretora; presidente tem o link do perfil. O + de cada grupo cadastra o número para o destinatário correspondente. Em telas menores, os grupos ficam um abaixo do outro.

Em **Todos os campos importados** ficam, editáveis: Presidente - Período Mandato, Presidente - Partido (uma única vez), DDD do município (conferido), Situação comercial e Setor comercial. Os últimos três continuam sendo dados locais do aplicativo. Recolher essa seção não apaga seus valores ao salvar. Conferência, observações e histórico permanecem visíveis em suas áreas.

### Atualizar preservando dados

Feche o aplicativo, faça backup de **dados** e copie o **conteúdo** da pasta mvp-jp-minato deste ZIP para a pasta atual do programa, substituindo os arquivos do aplicativo. Preserve a pasta dados. Evite criar outra pasta mvp-jp-minato dentro da antiga. Abra **INICIAR.bat**, pressione **Ctrl+F5** no navegador e confira **MVP 1.7** e o banco ativo no rodapé.

## Histórico: novidades da versão 1.6

### Adicionar telefone e WhatsApp pelo “+”

Na lista e em Dados e contatos, os atalhos de telefone e WhatsApp da Câmara e do presidente têm um botão **+**. Escolha o contato, cole um único número com DDD (com ou sem +55) e salve. O aplicativo confere o formato de fixo/celular e o DDD, normaliza o número, preserva os anteriores e evita duplicar o mesmo número nos dois campos.

DDD fora da referência do município exige marcar que você conferiu a exceção. O número será salvo como telefone e como atalho de WhatsApp; isso não comprova conta ativa. Use **Abrir WhatsApp para conferir** e, após conferir, marque **Confirmo que este número tem WhatsApp**. Números não confirmados mostram “?” no atalho; confirmados manualmente mostram “✓”. No formulário também é possível selecionar um número existente para conferir. Telefones fixos também podem ter WhatsApp; não são descartados por esse motivo.

Cadastrar um número não registra contato, mensagem ou envio e não altera sua situação comercial. A conferência não envia mensagem automaticamente.

### Mapa RS e raio

Abra **Mapa RS / raio**. O mapa dos 497 municípios está incluído no pacote, com limites do IBGE de 2025 e coordenadas de sedes da base Localidades do Brasil de 2022. O mapa e os controles funcionam localmente, sem conexão e sem baixar ruas ou imagens de serviços externos durante o uso.

1. Escolha uma sede municipal como centro (inicialmente Erechim) ou clique em **Escolher centro no mapa** e marque um ponto.
2. Informe o raio em km ou use 30, 50, 100 ou 150 km. O cálculo usa a sede municipal e distância em linha reta; não é trajeto por estrada.
3. Os cadastros dentro do raio ficam escolhidos. Marque/desmarque na lista lateral; clique em um município no mapa para consultar os dados, abrir o cadastro ou selecioná-lo manualmente.
4. Use **Aplicar municípios escolhidos à lista**. O filtro combina com UF, DDD, setor e demais filtros atuais; um filtro incompatível pode deixar a lista vazia.
5. **Limpar filtro do mapa** remove apenas o filtro geográfico. Filtrar a lista não marca os checkboxes usados nas ações em lote; para isso, use a seleção da lista.

Cores e legenda: verde para envio confirmado com PDF registrado; amarelo para contato sem envio confirmado de PDF; cinza para nenhum contato/envio registrado. Municípios sem cadastro ou ocultos pelo filtro aparecem claros. PDF gerado e mensagem enviada sem PDF não contam como envio de PDF. **Somente municípios sem envio confirmado de PDF** exclui os já atendidos. O histórico depende da confirmação manual de envio e não comprova entrega ou leitura.

O vínculo usa código IBGE válido quando disponível, senão UF e nome normalizado com correspondência única. Nomes ambíguos ou sem correspondência aparecem em aviso e não recebem coordenadas inventadas. Na cópia do banco enviado, 495 cadastros foram vinculados; CHIAPETA e SAO LUIS GONZAGA não coincidem exatamente com a malha. Pinto Bandeira e São Luiz Gonzaga aparecem sem cadastro correspondente no mapa. Não foram mesclados ou renomeados automaticamente. Revise esses cadastros antes de usar o filtro para eles.

### Correção ao copiar a pasta dados

A falta do PDF padrão agora mostra um aviso e permite carregar a lista de municípios. Antes, esse erro bloqueava toda a consulta. Arquivos gerenciados que foram copiados junto com dados (fotos, brasões, PDF padrão e PDFs) são procurados no mesmo caminho interno da pasta dados atual quando o caminho antigo não existe. A resolução não apaga nem altera o banco ao iniciar. Arquivos externos à pasta dados continuam dependendo de seus caminhos originais.

O caminho do **banco ativo** aparece no rodapé e no terminal, junto com o total de cadastros, para conferir qual instalação está em uso. A pasta dados deve estar ao lado de app.py e INICIAR.bat. Ter uma pasta extra mvp-jp-minato pode levar você a abrir outra instalação.

### Como atualizar para 1.6

Feche todas as janelas do programa, faça backup da pasta dados e substitua os arquivos do aplicativo mantendo essa pasta. Copie o conteúdo de mvp-jp-minato do ZIP para a pasta existente; evite criar outro mvp-jp-minato dentro dela. Abra INICIAR.bat e use Ctrl+F5. Confira o cabeçalho MVP 1.6 e o caminho do banco ativo no rodapé.

Validação: 45 testes passaram, incluindo uma cópia do banco real com 792 municípios, 496 projetos e 4.584 eleitos do RS, preservando seus registros. O fluxo real em navegador passou sem erros de JavaScript e sem requisições externas, incluindo mapa/raio/filtro e cadastro/conferência de números. O arquivo original enviado não foi modificado.

## Histórico: atualização para a versão 1.5

1. Feche o programa antigo (Ctrl+C na janela do terminal).
2. Faça uma cópia de segurança da pasta **dados**.
3. Extraia os arquivos deste pacote na pasta do programa, substituindo os arquivos antigos. **Mantenha sua pasta dados**; ela contém seus cadastros e arquivos. O ZIP não contém uma pasta dados para substituí-la.
4. Abra **INICIAR.bat** e pressione **Ctrl+F5** no navegador. Na versão 1.5, o cabeçalho mostrava **MVP 1.5**; este pacote mostra **MVP 1.15**.

### Histórico, envio e filtros

Na aba **Enviar PDF**, selecione o WhatsApp ou e-mail cadastrado, ou informe outro destinatário. Abra o aplicativo, anexe o PDF e envie. Ao voltar, use **Confirmar envio realizado** e **Salvar envio confirmado**. A confirmação salva imediatamente data/hora, canal, Câmara/presidente/outro, número/endereço, observações e referência ao PDF quando você marcar que o enviou.

**Registrar contato** permite registrar uma conversa sem envio de material; **Registrar outro contato realizado** atende outros canais. Abrir WhatsApp ou e-mail por um atalho não registra contato ou envio automaticamente. O programa não recebe confirmação de entrega ou leitura desses aplicativos.

A lista mostra a situação de contato e o último envio. O histórico completo aparece em **Dados e contatos** e **Enviar PDF**. Registros anteriores são mantidos. Contatos antigos sem canal conhecido continuam indicados sem inventar essa informação. Interessado e Cliente permanecem nessa situação ao registrar novo contato.

Use os novos filtros **Envio registrado**, **Contato realizado** e **Canal do contato / envio**, junto com estado, DDD e setor. O filtro por canal considera todo o histórico. Ao combinar **Com envio** com um canal, procura envios confirmados por esse canal. A lista mostra até 100 municípios por página; filtros, seleção de todos os encontrados e exportação abrangem todas as páginas.

### Atalhos na lista

O DDD ocupa uma coluna compacta. Em **Presidente / contatos**, ficam juntos os atalhos de WhatsApp da Câmara, WhatsApp do presidente, **Site da Câmara** e **Mesa Diretora**. Cada link abre o seu endereço em outra aba. Ausências aparecem desabilitadas. Os botões **Contatos**, **Baixar ZIP**, **Criar PDF** e **Enviar PDF** têm ícones e resposta visual ao passar o mouse ou clicar.

### TSE estadual ou nacional

Abra **Cadastrar TSE: estado / Brasil** e escolha uma UF ou **Brasil inteiro**. Selecione a consulta de candidatos de **2004** em CSV ou XLSX, descompactada, com até 250 MB. A importação começa automaticamente, com progresso. Mantenha o terminal aberto até concluir.

Na opção Brasil inteiro, a UF é lida em cada linha e os vereadores eleitos são organizados por estado e município. Nomes iguais em UFs diferentes ficam separados. A tela mostra totais e resumo por estado: eleitos, municípios, novos, vinculados e pendências de fotos. Contatos, edições manuais, histórico e registros fora do arquivo são preservados; reimportações não criam duplicados para a mesma UF/município.

Depois, escolha uma UF para carregar suas fotos DIV. A planilha nacional não exige um pacote nacional de fotos. Contatos das Câmaras também podem ser importados de uma planilha com vários estados, pelo botão próprio. A consulta eleitoral e a planilha de contatos têm finalidades diferentes.

Os testes usaram consultas CSV e XLSX com mais de uma UF, além de migração de dados, histórico, reimportação, fotos e PDF. A consulta nacional real do usuário ainda não foi fornecida; seus cabeçalhos e ano deverão ser conferidos ao importar. Outros anos eleitorais continuam fora deste fluxo.

## Correção 1.4.1 — seleção e importação de pastas

O ícone de pasta agora abre o seletor do navegador, sem esperar pela janela do Tkinter. Escolha a pasta e confirme o carregamento solicitado pelo navegador. O upload começa automaticamente e mostra o número de arquivos processados. As imagens selecionadas são copiadas para `dados/fotos_importadas`, mantendo nomes e subpastas. A associação ocorre ao concluir o upload; uma falha durante o envio mantém a pasta anterior ativa.

A pasta de originais deve ser importada antes da pasta de tratadas. Reimportar as originais preserva as tratadas associadas pela identidade do arquivo quando ela é única. Arquivos inválidos e caminhos perigosos são recusados. O caminho digitado continua sendo uma alternativa: cole a pasta e saia do campo para carregar diretamente, sem copiar as imagens.

A tela não fica bloqueada pela janela nativa. Mensagens de erro aparecem por cima do formulário aberto. Requisições que excedam dois minutos mostram erro e liberam a operação; a lista de municípios é carregada em consultas agrupadas para reduzir a demora.

Feche a janela antiga do programa antes de substituir os arquivos. Depois inicie novamente e use **Ctrl+F5** no navegador para carregar a nova interface.

## Novidades da versão 1.4 — catálogo completo

A ordem agora é **capa personalizada → comparativos do município → páginas padrão**. A capa enviada acompanha a instalação: somente o nome/UF e o brasão central são substituídos. O brasão usado na capa é o mesmo cadastrado para o município. Os elementos laterais, logo e fundo permanecem como no arquivo fornecido.

O PDF com sete páginas do portfólio também acompanha o programa. Com até nove vereadores, o catálogo terá **9 páginas** (uma capa, uma de comparativos e sete padrão). Mais vereadores geram páginas adicionais de comparativos, antes do portfólio.

Para trocar o portfólio: **Importar → Páginas padrão do catálogo**, ou **Configurações → Páginas padrão do catálogo**, selecione um PDF de até 30 MB. O upload começa automaticamente. Todas as páginas do arquivo são acrescentadas sem alterar textos, imagens, links ou a ordem. O padrão é global para todos os municípios; capas e comparativos continuam individuais. PDFs inválidos ou com senha são recusados. O arquivo anterior permanece vigente se o upload falhar.

Depois de trocar o padrão, gere novamente o catálogo de cada município para incluir a nova versão. PDFs de versões anteriores do aplicativo também ficam sinalizados para atualização. As versões já geradas não são apagadas.

## Novidades da versão 1.3

- Ícone de foto antiga em **Em restauração** e o mesmo desenho com brilho para os materiais restaurados. Os comparativos mostram os ícones e títulos **Original** e **Restaurada**.
- Atalhos separados para **WhatsApp da Câmara** e **WhatsApp do presidente**, na lista e no cadastro. Usam somente os campos de WhatsApp correspondentes. Sem número cadastrado, o atalho aparece desabilitado. Se houver vários números, você escolhe qual abrir.
- **Baixar ZIP** com ícone de arquivo e seta de download.
- Ícone de pasta para escolher as originais, tratadas e fotos DIV do estado. Confirmar a pasta já inicia o processamento; cancelar não altera o cadastro.
- Ao colar/digitar um caminho e sair do campo, a importação também começa automaticamente. Os botões de recarregar foram retirados.

Desde a versão 1.4.1, o seletor é do navegador e copia as imagens selecionadas para dados. Para vincular uma pasta sem copiar, use o campo de caminho completo. No upload DIV pelo navegador, as fotos continuam sendo copiadas para `dados`.

## Novo painel de produção

A página inicial mostra **Importar → Restaurar → Criar PDF → Enviar**. Os filtros continuam disponíveis. Cada município tem ações **Contatos**, **Baixar ZIP**, **Criar PDF** e **Enviar PDF**.

- **Importar** centraliza a planilha de contatos, consulta TSE, fotos DIV, tratadas e brasão.
- **Exportar** baixa contatos em Excel dos municípios filtrados ou selecionados. Inclui edições manuais, setor e situação comercial.
- **ZIP originais** baixa as pessoas selecionadas daquele município, com nomes, subpastas e manifesto. Envie o ZIP à IA de sua preferência e peça para manter os nomes/subpastas. Nenhuma imagem é enviada automaticamente.
- **Criar PDF** mostra as originais e tratadas. A aprovação individual foi removida. Pares completos ficam prontos; fotos ausentes e homônimos ambíguos continuam pendentes. A prévia permite visualizar pendências. O final exige brasão e tratadas para todas as pessoas selecionadas.
- **Enviar PDF** permite baixar/visualizar o PDF final, editar a mensagem e escolher um contato cadastrado ou digitar outro. WhatsApp abre a conversa; e-mail abre o aplicativo configurado. Anexe o PDF baixado e envie por lá. Esses links não conseguem anexar o arquivo automaticamente.
- **Compartilhar arquivo PDF** usa o compartilhamento de arquivos do navegador quando disponível. Se não houver suporte, baixa o PDF para anexar manualmente.
- **Registrar contato** registra o canal e destinatário sem marcar envio. **Confirmar envio realizado** registra um envio efetivamente realizado por você. Apenas abrir um aplicativo não registra envio. Não invalida o PDF.

Mudanças nas fotos, seleção, nomes, período, brasão ou nome/UF do município exigem gerar o PDF novamente. Ajustar telefone ou situação comercial não exige regenerar.

## Dados e contatos

A planilha enviada acompanha o pacote e é importada automaticamente na primeira execução (484 municípios). O botão **Importar → Contatos das Câmaras** permite atualizar a base no mesmo formato. Registros ausentes na nova planilha não são apagados. Correções manuais são preservadas. Campos diferentes da nova importação são destacados.

Os filtros combinam estados e DDDs (Ctrl + clique para vários), município, setor, contato disponível, situação comercial, conferência, situação da extração e etapa do material. O campo Arquivado da extração não oculta registros.

Em **Abrir cadastro**, edite os contatos e links, informe o setor e marque a conferência. O site abre em outra aba. A expansão **Todos os campos importados** também permite corrigir outros dados.

O DDD municipal é inferido quando os telefones institucionais oferecem uma única opção compatível com a UF. Divergências ficam sinalizadas. Porto União/SC tem exceção de DDD 42. O campo municipal pode ser conferido e editado. A lista por UF é uma referência, não um bloqueio de números pessoais ou de outras exceções. Não alteramos automaticamente o DDD de nenhum contato.

## Pastas e fotos

Em **Configurações**, indique a pasta de saída do extrator para cada estado, por exemplo:

```
D:\Fotos\fotos_eleitos_RS_2004\
    ERECHIM\2004\NOME DO VEREADOR.jpg
    FAXINALZINHO\2004\NOME DO VEREADOR.jpg
```

O extrator enviado está em **extrator/** e permanece disponível para uso separado. A partir da versão 1.1, também é possível cadastrar a consulta de candidatos e as fotos DIV diretamente no painel **TSE por estado**, sem executar o extrator separado. O aplicativo não baixa os pacotes do TSE pela internet.

## Cadastro TSE por estado (também disponível em Brasil inteiro)

1. Abra **TSE por estado** e escolha RS, SC ou outro estado.
2. Importe a **consulta de candidatos de 2004** em CSV ou XLSX. Ela deve conter UF, ano, cargo, resultado eleitoral, nome, município, unidade eleitoral e identificador do candidato. A planilha de contatos das Câmaras continua sendo importada no botão **Importar contatos**.
3. Clique no ícone de pasta e escolha a pasta descompactada com todas as fotos DIV do mesmo estado e ano. A associação começa assim que você confirma a pasta. Se preferir, cole o caminho e saia do campo para iniciar. Ou use **fazer upload da pasta de fotos** para copiar todas as imagens para o aplicativo.
4. O aplicativo filtra somente vereadores eleitos em 2004 e usa a regra histórica `F + UF + unidade eleitoral + _ + identificador com cinco dígitos + _DIV`. Não associa por número de urna ou por nome isolado.
5. Os municípios são vinculados aos contatos existentes pela UF e pelo nome normalizado. Municípios ausentes são cadastrados com contatos pendentes. Importar posteriormente a planilha de contatos enriquece esses cadastros sem duplicá-los. Edições manuais e setores são preservados.
6. As fotos dos eleitos são copiadas para **dados/tse/UF/eleitos/MUNICIPIO/2004**, com apenas o nome completo no arquivo. Homônimos usam subpastas **HOMONIMOS/identificador**.
7. As originais já aparecem nos municípios. Ficam pendentes as tratadas, o brasão para o PDF final. Se uma foto original faltar ou for ambígua, isso também será mostrado na aba **Fotos e PDF**.

O resumo estadual informa eleitos, municípios, originais encontradas, ausentes e ambíguas. Há um relatório detalhado em **dados/tse/UF/relatorio_fotos_2004.json**. Todas as fotos DIV podem ser registradas, mas apenas as dos vereadores eleitos entram nos projetos e nos PDFs.

Se as fotos DIV já estão no computador, prefira indicar o caminho para evitar copiar todas as fotos de candidatos. O upload copia a pasta inteira para dados/tse/UF/uploads. CSV/XLSX aceita até 250 MB e cada imagem de upload até 30 MB. ZIPs devem ser descompactados antes. Consultas de outros anos, como 2022, são rejeitadas neste fluxo. Ao reprocessar as fotos, links de tratadas já associados são preservados quando o candidato é identificado. Quando a original muda, o PDF anterior é marcado para atualização.

## Atualizar de uma versão anterior

Feche o programa e faça backup da pasta **dados**. Extraia a versão 1.4.1 sobre a mesma pasta do programa, substituindo os arquivos. Este ZIP não contém uma pasta dados, portanto não substitui seu banco. Preserve o caminho da instalação para manter os links de brasões, PDFs e fotos já cadastrados.

Na aba **Fotos e PDF**:

1. Clique no ícone de pasta ao lado das originais e escolha a pasta municipal. O carregamento começa automaticamente. Se preferir, cole o caminho completo e saia do campo para carregar. A busca normaliza acentos, espaços, maiúsculas e sublinhados. A pasta 2004 é usada quando existe; subpastas de outros anos são ignoradas.
2. Restaure as fotos fora do programa, mantendo os nomes. O botão **Baixar ZIP das originais** exporta as pessoas selecionadas, preservando nomes e subpastas. O MVP não restaura as fotos.
3. Clique no ícone de pasta ao lado das tratadas e escolha a pasta municipal com as fotos prontas.
4. As tratadas são importadas e associadas automaticamente, sem outro clique. A associação usa nome sem extensão e subpastas para homônimos. Pode trocar JPG por PNG. Duplicidades exigem revisão manual; nenhuma associação por ordem de arquivo é feita.
5. Corrija o nome de exibição, associe manualmente quando necessário, selecione as pessoas para incluir no PDF. Não é necessário confirmar os pares individualmente. Use **Salvar seleção e nomes** se fizer alterações.
6. Cadastre o brasão do município (PNG/JPG/WebP). Cada município guarda seu brasão próprio.
7. Gere uma prévia ou o PDF final. O final exige brasão e todos os pares selecionados completos. Até nove pares por página; o restante gera páginas adicionais.

Os nomes das fotos devem ser iguais, por exemplo `DANILO MEDINA PEREIRA.jpg` e `DANILO MEDINA PEREIRA.png`. Para homônimos, preserve `HOMONIMOS\identificador\NOME.jpg` nas duas raízes ou use a associação manual.

## PDF

Usa a página institucional fornecida em assets/modelo.pdf. Reconstrói o layout da página com o fundo e logo originais e textos institucionais. Nenhuma foto, nome ou brasão do município-exemplo é transferido para a nova página. O período é editável, com padrão 2005–2008; a eleição é 2004. As imagens são encaixadas proporcionalmente, sem deformação. Não amplia resolução nem recorta retratos automaticamente. O catálogo inclui capa personalizada, páginas de comparativos e o PDF padrão enviado, preservando suas páginas na ordem original.

O PDF é baixado pelo navegador e salvo também em dados/pdfs. Mudanças posteriores indicam que o arquivo anterior está desatualizado. Um novo PDF recebe outro nome, preservando os anteriores.

## Backup e limitações

Feche o programa e copie a pasta **dados** para backup. Ela contém banco, brasões e PDFs. As fotos ficam vinculadas aos caminhos originais: mantenha essas pastas disponíveis e faça backup delas também. Se mover fotos ou trocar de computador, configure os caminhos novamente e recarregue as imagens.

O aplicativo escuta somente no computador local, em 127.0.0.1. Não possui autenticação para rede nem deve ser exposto à internet. A porta preferida é 8765; se ocupada, tenta outras até 8784.

Ainda não incluídos: consulta automática da tabela oficial de DDD por município, importação de ZIP de tratadas, geração de PDFs em lote, editor livre do layout, envio automático de WhatsApp/e-mail e sincronização entre computadores. O upload das fotos DIV permite escolher a pasta pelo navegador. As pastas municipais e DIV podem ser escolhidas pelo seletor do navegador ou informadas pelo caminho. O PDF é gerado por município.

## Executar em outros sistemas

```
python -m pip install -r requirements.txt
python app.py
```

## Testes

Os 53 testes em tests/test_flow.py, tests/test_tse.py, tests/test_picker.py, tests/test_updates.py , tests/test_numbers_map.py e tests/test_routes.py cobrem importação/atualização sem perda de edição, associação histórica DIV de 2004, filtros eleitorais, agrupamento sem duplicar municípios, fotos ausentes/ambíguas, segurança dos caminhos de upload, homônimos, bloqueio de fotos tratadas ausentes e PDF sem dados residuais de Faxinalzinho. Incluem também migração, confirmação e histórico de envios, rotas HTTP e consultas nacionais CSV/XLSX. Execute `python -m unittest discover -s tests -v`. Na versão 1.6, o mapa, cadastro rápido, filtros e seleção também foram verificados em navegador, com inspeção visual da interface.

### Validação da versão 1.11

88 testes automatizados passaram. Verificação real da interface em navegador: fila selecionada com 1 município, fila de filtros com 105 apesar dos 100 por página, links de WhatsApp preservados na lista/cadastro/envio e após recarregar, zero erros JavaScript. A busca retornou resultados controlados durante essa verificação; não garante resultados públicos do Google. O menu da extensão foi testado com API Chrome simulada; recarregue a extensão 1.11.0 no Chrome do Windows para usar os novos menus. Banco original enviado preservado.

## Acesso remoto — MVP 1.15

- Banco SQLite e imagens continuam locais no escritório. Computadores clientes usam navegador; não compartilhe o arquivo do banco pela rede.
- Iniciador com senha, detecção de IP de VPN, atalhos, início automático por usuário e botão para regra do Firewall (UAC do Windows). A regra limita o programa à porta 8765 e ao IP privado escolhido.
- Servidor escuta apenas 127.0.0.1 e o IPv4 privado configurado. Não usa 0.0.0.0, encaminhamento de porta ou publicação na internet. Configurar IP da VPN, não IP do roteador. Se a VPN ainda não estiver disponível no início, tenta abrir o endereço novamente a cada 10 segundos.
- Login também no escritório quando remoto habilitado; sessão de 12 horas, botão Sair, senha armazenada como hash scrypt. Troca de senha requer reinício, invalidando sessões. Controle de tentativas de login e validação do Host/Origin. Tráfego HTTP deve permanecer dentro do túnel criptografado da VPN.
- Capturas usam ticket/token limitado ao município. Extensão **1.15.0**: recarregue no Chrome. Na máquina de casa, ícone da extensão → endereço privado do servidor → Autorizar servidor da VPN. A permissão é opcional e específica ao endereço autorizado; um novo vínculo deve ser iniciado pelo município no MVP.
- Fotos, brasões, planilhas e PDF padrão enviados pelo navegador ficam no escritório. Pastas escolhidas são desta máquina; caminhos digitados são do servidor. Seletor nativo remoto e Abrir pasta no escritório bloqueados; use upload ou Baixar ZIP.
- Chaves OpenAI/provedores permanecem no servidor. Não precisa recadastrar a chave em cada computador cliente.
- O servidor processa extração/restauração/PDF; conexão fechada não é pedido de cancelamento de tarefa. Para manutenção, conclua ou pause trabalhos antes de reiniciar. Não há sincronização offline entre cópias nem edição simultânea com prevenção de sobrescrita.
- Inicialização, atalhos, UAC/firewall e menu nativo da extensão devem ser conferidos no Windows real do usuário; foram verificados os fluxos HTTP e navegador em ambiente de teste. A conexão física casa/escritório depende da instalação da VPN e do firewall.
- Diagnóstico: dados/instalacao.log e dados/servidor.log. Não apague dados ao atualizar. Faça backup integral com servidor encerrado; cópia em outro local é necessária para recuperação se o disco falhar.

VPNs: https://tailscale.com/docs/install/windows e https://tailscale.com/pricing. O plano Personal divulgado é para uso não comercial; não assumir gratuidade empresarial. ZeroTier: https://www.zerotier.com/pricing/ também distingue licença pessoal e empresarial. O MVP aceita IPv4 privado de uma VPN existente, incluindo WireGuard, sem depender de contratação de um desses serviços.
