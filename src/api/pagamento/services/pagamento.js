'use strict';

const removeAccents = (value = '') => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const onlyAlphaNum = (value = '') => removeAccents(value).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
const formatAmount = (amount) => Number(amount || 0).toFixed(2);

const tlv = (id, value) => {
  const safeValue = String(value ?? '');
  return `${id}${safeValue.length.toString().padStart(2, '0')}${safeValue}`;
};

const crc16 = (payload) => {
  let crc = 0xffff;
  for (let offset = 0; offset < payload.length; offset += 1) {
    crc ^= payload.charCodeAt(offset) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) !== 0 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
};

const buildPixPayload = ({ chavePix, nomeRecebedor, cidadeRecebedor, valor, txid }) => {
  const merchantAccount = tlv('00', 'br.gov.bcb.pix') + tlv('01', chavePix);
  const additionalData = tlv('05', onlyAlphaNum(txid || 'AGROMART').slice(0, 25));
  const payloadSemCRC = [
    tlv('00', '01'),
    tlv('26', merchantAccount),
    tlv('52', '0000'),
    tlv('53', '986'),
    tlv('54', formatAmount(valor)),
    tlv('58', 'BR'),
    tlv('59', onlyAlphaNum(nomeRecebedor || 'CSA AGROMART').slice(0, 25)),
    tlv('60', onlyAlphaNum(cidadeRecebedor || 'BRASILIA').slice(0, 15)),
    tlv('62', additionalData),
  ].join('');

  const payloadParaCRC = `${payloadSemCRC}6304`;
  return `${payloadParaCRC}${crc16(payloadParaCRC)}`;
};

const makeHistory = (status, observacao = '') => ([{ status, observacao, data: new Date().toISOString() }]);

const appendHistory = (pagamento, status, observacao = '') => {
  const history = Array.isArray(pagamento?.historico_status) ? pagamento.historico_status : [];
  return [...history, { status, observacao, data: new Date().toISOString() }];
};

const appendPedidoHistory = (pedido, status, observacao = '') => {
  const history = Array.isArray(pedido?.historico_status) ? pedido.historico_status : [];
  return [...history, { status, observacao, data: new Date().toISOString() }];
};

const FINAL_STATUSES = ['APROVADO', 'REJEITADO'];

const normalizeRole = (role = {}) => String(role.name || role.code || role.type || '').toLowerCase();

const isFarmerUser = (user = {}) => {
  const role = normalizeRole(user.role);
  const farmerTerms = ['agricultor', 'produtor', 'producer', 'farmer', 'gestor', 'manager', 'admin'];
  return Boolean(user.loja?.id) || farmerTerms.some(term => role.includes(term));
};

const assertCanTransition = (pagamento, acao) => {
  if (FINAL_STATUSES.includes(pagamento?.status)) {
    throw new Error(`Pagamento já finalizado como ${pagamento.status}. Não é possível ${acao}.`);
  }
};

const toId = (value) => {
  if (!value) return undefined;
  if (typeof value === 'object') return value.id;
  return value;
};

const calcularValorExtrato = (extrato = {}) => {
  if (extrato.valor !== undefined && extrato.valor !== null) return Number(extrato.valor);
  const itens = Array.isArray(extrato.itens) ? extrato.itens : [];
  return itens.reduce((total, item) => total + Number(item.valor || 0) * Number(item.quantidade || 1), 0);
};

const getRelationId = (relation) => {
  if (!relation) return undefined;
  if (typeof relation === 'number' || typeof relation === 'string') return Number(relation);
  if (relation.id) return Number(relation.id);
  if (relation.data?.id) return Number(relation.data.id);
  return undefined;
};

const assertFarmerOwnsPayment = (user, pagamento) => {
  if (!isFarmerUser(user)) {
    throw new Error('Acesso restrito ao agricultor familiar/produtor.');
  }

  const userStoreId = getRelationId(user.loja);
  const paymentStoreId = getRelationId(pagamento.loja);

  // Quando o usuário agricultor tem loja vinculada, ele só pode operar pagamentos dessa loja.
  // Se a instalação ainda não vinculou usuários a lojas, mantemos o acesso do papel agricultor para não bloquear o MVP.
  if (userStoreId && paymentStoreId && userStoreId !== paymentStoreId) {
    throw new Error('Este pagamento pertence a outra loja/CSA.');
  }
};

const assertConsumerOwnsPayment = (user, pagamento) => {
  const consumerId = getRelationId(pagamento.consumidor) || getRelationId(pagamento.user) || getRelationId(pagamento.usuario);
  if (!consumerId || Number(user.id) !== Number(consumerId)) {
    throw new Error('Este pagamento não pertence ao cliente autenticado.');
  }
};

module.exports = ({ strapi }) => ({
  async find() {
    return strapi.entityService.findMany('api::pagamento.pagamento', {
      populate: ['comprovante', 'extrato', 'pedido', 'loja', 'consumidor'],
      sort: { createdAt: 'desc' },
    });
  },

  async findForFarmer(user) {
    const filters = {};
    const storeId = getRelationId(user?.loja);
    if (storeId) filters.loja = { id: storeId };

    return strapi.entityService.findMany('api::pagamento.pagamento', {
      filters,
      populate: ['comprovante', 'extrato', 'pedido', 'loja', 'consumidor'],
      sort: { createdAt: 'desc' },
    });
  },

  async findForConsumer(userId) {
    return strapi.entityService.findMany('api::pagamento.pagamento', {
      filters: { consumidor: { id: userId } },
      populate: ['comprovante', 'extrato', 'pedido', 'loja', 'consumidor'],
      sort: { createdAt: 'desc' },
    });
  },

  async findOne(id) {
    return strapi.entityService.findOne('api::pagamento.pagamento', id, {
      populate: ['comprovante', 'extrato', 'pedido', 'loja', 'consumidor'],
    });
  },

  async canUserAccessPayment(user, pagamento) {
    if (isFarmerUser(user)) {
      const userStoreId = getRelationId(user?.loja);
      const paymentStoreId = getRelationId(pagamento?.loja);
      return !userStoreId || !paymentStoreId || userStoreId === paymentStoreId;
    }

    const consumerId = getRelationId(pagamento?.consumidor);
    return Boolean(consumerId && Number(consumerId) === Number(user?.id));
  },

  async gerarPix(data, user) {
    let extrato;
    const extratoId = toId(data.extrato);
    const pedidoId = toId(data.pedido);
    if (extratoId) {
      extrato = await strapi.entityService.findOne('api::extrato.extrato', extratoId, {
        populate: ['user', 'loja', 'itens', 'itens.produto_avulso', 'itens.plano'],
      });
    }

    const valor = Number(data.valor || calcularValorExtrato(extrato));
    if (!valor || Number.isNaN(valor)) {
      throw new Error('Valor da cobrança inválido. Selecione um pedido com valor ou informe o valor manualmente.');
    }

    const loja = toId(data.loja) || toId(extrato?.loja) || toId(user?.loja);
    const consumidor = toId(data.consumidor) || toId(extrato?.user);
    const referenciaPedido = data.referencia_pedido || (pedidoId ? `Pedido #${pedidoId}` : (extratoId ? `Pedido #${extratoId}` : undefined));
    if (!referenciaPedido) throw new Error('Referência do pedido é obrigatória.');

    const txid = data.txid || `AGRO${Date.now()}`.slice(0, 25);
    const pixPayload = buildPixPayload({
      chavePix: data.chave_pix,
      nomeRecebedor: data.nome_recebedor,
      cidadeRecebedor: data.cidade_recebedor,
      valor,
      txid,
    });

    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(pixPayload)}`;

    return strapi.entityService.create('api::pagamento.pagamento', {
      data: {
        referencia_pedido: referenciaPedido,
        valor,
        status: 'PENDENTE',
        tipo: 'PIX',
        chave_pix: data.chave_pix,
        nome_recebedor: data.nome_recebedor,
        cidade_recebedor: data.cidade_recebedor || 'BRASILIA',
        txid,
        pix_copia_cola: pixPayload,
        qr_code_url: qrCodeUrl,
        observacao: data.observacao,
        data_vencimento: data.data_vencimento,
        extrato: extratoId,
        pedido: pedidoId,
        loja,
        consumidor,
        historico_status: makeHistory('PENDENTE', 'Cobrança Pix gerada pelo AgroMart'),
      },
      populate: ['comprovante', 'extrato', 'pedido', 'loja', 'consumidor'],
    });
  },

  async enviarComprovante(id, data = {}, files = {}, user) {
    const pagamento = await this.findOne(id);
    if (!pagamento) throw new Error('Pagamento não encontrado');
    if (isFarmerUser(user)) {
      assertFarmerOwnsPayment(user, pagamento);
    } else {
      assertConsumerOwnsPayment(user, pagamento);
    }
    assertCanTransition(pagamento, 'registrar comprovante');

    let uploadedFileId = data.comprovante;
    const file = files?.comprovante || files?.files || files?.['files.comprovante'];
    if (file) {
      const uploaded = await strapi.plugin('upload').service('upload').upload({ data: {}, files: file });
      uploadedFileId = uploaded?.[0]?.id;
    }

    const updateData = {
      status: 'COMPROVANTE_ENVIADO',
      observacao: data.observacao || pagamento.observacao || 'Comprovante registrado sem anexo pela interface web.',
      ocr_resultado: data.ocr_resultado || pagamento.ocr_resultado || {
        situacao: 'PENDENTE_ANALISE_MANUAL',
        mensagem: 'Comprovante recebido/registrado. Validação OCR preparada para evolução futura com Tesseract.',
      },
      historico_status: appendHistory(pagamento, 'COMPROVANTE_ENVIADO', data.observacao || 'Comprovante registrado'),
    };

    if (uploadedFileId) updateData.comprovante = uploadedFileId;

    return strapi.entityService.update('api::pagamento.pagamento', id, {
      data: updateData,
      populate: ['comprovante', 'extrato', 'pedido', 'loja', 'consumidor'],
    });
  },

  async aprovar(id, observacao = '', user) {
    const pagamento = await this.findOne(id);
    if (!pagamento) throw new Error('Pagamento não encontrado');
    assertFarmerOwnsPayment(user, pagamento);
    assertCanTransition(pagamento, 'aprovar');

    if (pagamento.extrato?.id) {
      await strapi.entityService.update('api::extrato.extrato', pagamento.extrato.id, {
        data: { pagamento_realizado: true },
      });
    }

    if (pagamento.pedido?.id) {
      await strapi.entityService.update('api::pedido.pedido', pagamento.pedido.id, {
        data: {
          status: 'PAGO',
          historico_status: appendPedidoHistory(pagamento.pedido, 'PAGO', observacao || 'Pagamento aprovado no módulo de pagamentos'),
        },
      });
    }

    return strapi.entityService.update('api::pagamento.pagamento', id, {
      data: {
        status: 'APROVADO',
        data_confirmacao: new Date().toISOString(),
        observacao: observacao || pagamento.observacao,
        historico_status: appendHistory(pagamento, 'APROVADO', observacao || 'Pagamento aprovado pelo agricultor/gestor'),
      },
      populate: ['comprovante', 'extrato', 'pedido', 'loja', 'consumidor'],
    });
  },

  async rejeitar(id, motivo = '', user) {
    const pagamento = await this.findOne(id);
    if (!pagamento) throw new Error('Pagamento não encontrado');
    assertFarmerOwnsPayment(user, pagamento);
    assertCanTransition(pagamento, 'rejeitar');

    if (pagamento.pedido?.id) {
      await strapi.entityService.update('api::pedido.pedido', pagamento.pedido.id, {
        data: {
          status: 'CANCELADO',
          historico_status: appendPedidoHistory(pagamento.pedido, 'CANCELADO', motivo || 'Pagamento rejeitado no módulo de pagamentos'),
        },
      });
    }

    return strapi.entityService.update('api::pagamento.pagamento', id, {
      data: {
        status: 'REJEITADO',
        motivo_rejeicao: motivo,
        historico_status: appendHistory(pagamento, 'REJEITADO', motivo || 'Pagamento rejeitado pelo agricultor/gestor'),
      },
      populate: ['comprovante', 'extrato', 'pedido', 'loja', 'consumidor'],
    });
  },

  async excluir(id, user) {
    const pagamento = await this.findOne(id);
    if (!pagamento) throw new Error('Pagamento não encontrado');
    assertFarmerOwnsPayment(user, pagamento);
    return strapi.entityService.delete('api::pagamento.pagamento', id);
  },
});
