# Identificador PN da própria conta — 23/10/2026

A captura após a extensão 1.17.1 passou a mostrar uma conta reconhecida diferente da configurada por um nono dígito. O runtime agora identifica o PN e mantém comparação exata. O cadastro do MVP usava a validação de telefone de contato, que rejeitava celular legado de oito dígitos e impediria simplesmente copiar o PN detectado.

- Normalizador separado exclusivamente para expected_number da conta de envio. Preserva formato brasileiro válido e aceita PN legado de oito dígitos, com DDD brasileiro válido, sem acrescentar/remover nono dígito. Não altera normalize_phone nem inventário de destinatários.
- Conta diferente continua bloqueando consulta/envio. Mudar configuração invalida vínculo antigo e cancela fila não enviada; reconexão explícita exigida. Mensagens em transmissão continuam protegidas contra troca de configuração.
- Dois testes novos: configuração de PN legado, cancelamento de fila, invalidação de token e novo vínculo; identidade exata na conexão e bloqueio de conta divergente; preservação do validador normal dos contatos; limpeza de formatação sem mutar dígitos e rejeição de formatos/DDD inválidos.
- Regressão do módulo sender e integração Node da extensão/worker HTTP/SQLite com Chrome/WhatsApp simulados executadas. Nenhuma sessão real nem mensagem real. Precisará selecionar o identificador detectado e reconectar na máquina do escritório.
- Extensão permanece 1.17.1, WA-JS 4.7.1. Pacote completo MVP 1.31.2 e correção rápida de um único módulo para MVP 1.31/1.31.1, sem alteração de dados. O ZIP rápido conserva a versão exibida pelo servidor anterior.
