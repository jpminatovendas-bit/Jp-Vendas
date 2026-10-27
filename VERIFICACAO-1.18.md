# Verificação — JP Minato 1.18

Atualização autorizada em 18/10/2026, após acumular os itens 37 a 46. O pacote atualiza o aplicativo e preserva a pasta dados da instalação existente.

## Alterações

- Filtros em details/summary, inicialmente recolhidos, mantendo valores/seleção; contagem e ações dos selecionados permanecem visíveis. Coluna DDD retirada da tabela, com filtro e cadastro preservados.
- Botões de telefone mostram papel e número, com WhatsApp somente quando confirmado; atalhos redundantes de conferência retirados da linha principal. Verificador continua no painel.
- Comparação de contatos entre Câmara e presidente com normalização de telefone/links e caixa de e-mail; aviso vermelho sem fusão ou exclusão.
- Enviar PDF: preferência por celular separadamente por destinatário, mantendo fixo como alternativa se não houver celular elegível; números explicitamente ausentes no WhatsApp continuam excluídos. Tipo de telefone não é confirmação de WhatsApp.
- Aberturas persistidas em contact_openings com chave município/canal/papel/contato normalizado. Estado de abertura separado do histórico reversível de envio declarado. Nenhum novo campo sobrescreve as tabelas antigas de contatos/interações.
- Indicadores por contato, fundo verde de abertura e símbolo de envio registrado. Registro desmarcado perde o símbolo de envio, preservando abertura e auditoria. Popup bloqueado não grava.
- Quatro modelos em settings, com validação de tamanho/variáveis, assunto de e-mail em linha única, prévia por papel e bloqueio de variável sem dado. Horário da saudação fixo em America/Sao_Paulo; primeiro nome preserva acentos cadastrados. Configurações gerais e botão específico salvam os modelos. Ajustes temporários por município mantidos durante recargas da tela.
- Destinatários cadastrados seguem seu papel, sem seletor redundante. Contato manual reconhecido em um só papel tem vínculo automático/bloqueado; compartilhado/desconhecido pode ser identificado manualmente.
- Site da Câmara, Mesa Diretora e Perfil do presidente iniciam o mesmo fluxo de tickets autorizados, preservando município, finalidade e tab ID; extensão continua 1.16.0. Capturas diretas das três URLs e rejeição de aba/destino indevidos testadas.

## Mapa e medições

- A abertura anterior consultava /api/data para obter rotas, recalculando também projetos/caminhos/estado de fotos. Agora usa /api/routes, sem carregar novamente toda a base; primeira malha e rotas são buscadas em paralelo.
- bindGeography anterior repetia filtros e normalizações para cada uma das 497 feições. Índices por IBGE/nome substituem a busca repetitiva, mantendo regra de ambiguidade e prioridade por código.
- Benchmark isolado em Node, 15 execuções com a mesma malha e 497 cadastros correspondentes: mediana anterior 100,02 ms; nova 0,94 ms; 497 vínculos nos dois casos. Isso mede associação, não tempo total no computador do cliente.
- Malha e mapa reutilizados na mesma página; canvas para polígonos; não redesenhar mapa fechado nem recriar rotas com conteúdo inalterado. Preservados cores, numeração, sobreposição e filtros.
- Abertura aguarda layout e ajusta tamanho sem temporizador tardio. Foco inicial sem rolar o diálogo evita perder o primeiro clique no marcador devido a deslocamento de foco. Marcadores mantêm interação por teclado.

## Validação

- 205 testes Python aprovados, incluindo seis novos: modelos persistentes/independentes; rejeição de variável desconhecida, tamanho e assunto inválidos sem sobrescrever; abertura normalizada/persistente sem alegar envio; entradas inválidas sem gravação; concorrência/idempotência por papel; captura direta de três páginas com proteção por aba e bloqueio de destino externo.
- Verificação Chromium com servidor real, SQLite e arquivos temporários, sem produção: filtros, DDD, números, duplicados, preferência de celular/fixo alternativo, saudação nos limites 12h/18h, nome acentuado, modelos distintos por canal/papel, aberturas e envios por contato, correção sem apagar abertura, recarga da página, popup bloqueado, contato manual reconhecido, botões iniciando tickets, configuração salva no servidor e mapa reutilizado.
- Verificação adicional de duas rotas no mapa: números e cores diferentes, clique no marcador e abertura da rota como filtro da lista. Sem erro JavaScript na execução final. Tempos de abertura são registrados no relatório de execução desta entrega.
- Links externos foram interceptados por janelas simuladas: nenhum WhatsApp real, e-mail ou mensagem enviado. Nenhuma consulta real de WhatsApp, gravação no Google, chamada paga de IA ou instalação de produção foi executada.
- Windows/VBS/DPAPI/menu nativo da extensão e VPN física não executados neste ambiente. Tempos locais não garantem os mesmos tempos no disco/rede do cliente. Banco original não modificado.

## Atualização

Parar servidor, fazer backup de dados inteiro, mesclar os arquivos da pasta mvp-jp-minato do ZIP na instalação atual sem excluir dados, abrir ABRIR-JP-MINATO e Ctrl+F5. Modelos em Configurações gerais. Recarregar extensão se seus arquivos forem substituídos e iniciar capturas novas. Guia GUIA-NOVIDADES-1.18.html incluído. Sem banco, credenciais, .venv, node_modules, imagens de teste ou navegador no pacote.

Execução final em Chromium: 497 municípios; primeira abertura do mapa 185 ms; reabertura 83 ms, no cenário local de teste. Confirmado clique em rotas numeradas/coloridas e filtro de dois municípios. Associação isolada: 100,02 ms → 0,94 ms (medianas de 15 execuções). Sem garantia de tempo no ambiente real.
