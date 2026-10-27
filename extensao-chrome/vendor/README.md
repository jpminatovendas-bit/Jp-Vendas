# WA-JS da estação WhatsApp

Pacote @wppconnect/wa-js 4.7.1 (release estável). Licença Apache-2.0 em LICENSE e avisos de terceiros em wppconnect-wa.js.LICENSE.txt.
Origem: https://registry.npmjs.org/@wppconnect/wa-js/-/wa-js-4.7.1.tgz
Integridade SHA-512 do tarball verificada: vcA9q0adL6O9ixRM33wa3geKmYEz+CYP0k1t0rwCAxkp5rjl1YLO3hQOwPRfbTwdgMXC1RtaEl0g625v4In/tw==
SHA-256 de wppconnect-wa.js: ed4cc6b17ce18d726b0bd89c0b30021c5b8266f823f13509c08170b7ace96126

Carregado localmente pela extensão, sem CDN durante o uso. Nenhuma função de migração LID foi sobrescrita ou forçada. A estação identifica telefone PN quando disponível e não usa LID como telefone. Conta diferente, biblioteca carregando, falta de autenticação e erro interno têm diagnósticos separados. Consulta antes de uma saudação por clique; ACK e identidade exigidos para registro. Método não oficial, ainda requer teste com a sessão real do usuário.

Integração 1.17.2: queryWidExists pode retornar null também em exceções capturadas pela biblioteca; null/undefined não provam ausência de conta. PN canônico brasileiro com nono dígito omitido só é aceito como retorno da consulta original. LID exige vínculo exato em getPnLidEntry com PN compatível. Sem comprovação, não envia. O número cadastrado não é alterado.
