# JP Minato 1.17 — Verificação

199 testes automatizados, incluindo 14 novos de armazenamento e os sete da
correção de raster/brasão. Testes anteriores adaptados para verificar exclusão
ou alteração do arquivo gerenciado, em vez de depender da pasta de origem.

Cobertura: cópia de originais/tratadas por caminho; funcionamento depois da
remoção das origens; geração de PDF; reimportação idêntica; conteúdo novo sem
sobrescrever a cópia anterior; falha sem troca de vínculos; centralização de
legado, brasões/versões, PDF padrão, modelos, histórico e fila da IA; arquivo
ausente preservado como pendência; edição concorrente preservada; repetição
idempotente; bloqueio durante restauração; preferência por cópia local de dados;
histórico de origem preservado sem ser tratado como dependência externa.

Navegador Chromium com servidor real e dados temporários: fluxos de seleção,
envio declarado, correção, CSV Google e fila de verificação preservados. Painel
de armazenamento executou a coleta, atualizou contagens e permitiu gerar PDF
final após remover as pastas externas do cenário. Sem erros JavaScript.

Sem alteração do banco original do usuário, consulta real de WhatsApp, gravação
real no Google, envio de mensagens ou geração paga de imagens. APIs externas e
aplicativos de envio simulados. A centralização foi testada com arquivos locais
temporários; menu/extensão/DPAPI/VBS e instalação de Pillow no Windows precisam
de conferência na máquina do usuário. Arquivos externos inacessíveis ficam no
relatório; não há promessa de recuperação de arquivos perdidos.
