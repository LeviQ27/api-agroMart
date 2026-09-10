'use strict';

const getRelationId = (relation) => {
  if (!relation) return undefined;
  if (typeof relation === 'number' || typeof relation === 'string') return Number(relation);
  if (relation.id) return Number(relation.id);
  if (relation.data?.id) return Number(relation.data.id);
  return undefined;
};

const normalizeRole = (role = {}) => String(role.name || role.code || role.type || '').toLowerCase();
const isFarmerUser = (user = {}) => {
  const role = normalizeRole(user.role);
  const farmerTerms = ['agricultor', 'produtor', 'producer', 'farmer', 'gestor', 'manager', 'admin'];
  return Boolean(user.loja?.id) || farmerTerms.some(term => role.includes(term));
};

const normalizeItem = (item = {}) => ({
  id: item.id || item.produto || item.produto_id || item.plano || item.cesta,
  tipo: item.type || item.tipo || 'produto',
  nome: item.name || item.nome || item.produto || 'Item',
  quantidade: Number(item.quantity || item.quantidade || 1),
  valor_unitario: Number(item.value || item.valor || item.valor_unitario || 0),
  valor_total: Number(item.total || item.valor_total || Number(item.value || item.valor || 0) * Number(item.quantity || item.quantidade || 1)),
});

const normalizeItens = (itens) => {
  if (Array.isArray(itens)) return itens.map(normalizeItem);
  if (Array.isArray(itens?.produtos)) return itens.produtos.map(normalizeItem);
  if (itens && typeof itens === 'object') return Object.values(itens).flat().map(normalizeItem);
  return [];
};

const totalFromItens = (itens) => itens.reduce((total, item) => total + Number(item.valor_total || 0), 0);
const history = (status, observacao = '') => [{ status, observacao, data: new Date().toISOString() }];
const appendHistory = (pedido, status, observacao = '') => ([...(Array.isArray(pedido?.historico_status) ? pedido.historico_status : []), { status, observacao, data: new Date().toISOString() }]);

module.exports = ({ strapi }) => ({
  async findOne(id) {
    return strapi.entityService.findOne('api::pedido.pedido', id, {
      populate: ['loja', 'cliente', 'endereco_entrega'],
    });
  },

  async findForConsumer(userId) {
    return strapi.entityService.findMany('api::pedido.pedido', {
      filters: { cliente: { id: userId } },
      populate: ['loja', 'cliente', 'endereco_entrega'],
      sort: { createdAt: 'desc' },
    });
  },

  async findForFarmer(user) {
    const filters = {};
    const lojaId = getRelationId(user?.loja);
    if (lojaId) filters.loja = { id: lojaId };

    return strapi.entityService.findMany('api::pedido.pedido', {
      filters,
      populate: ['loja', 'cliente', 'endereco_entrega'],
      sort: { createdAt: 'desc' },
    });
  },

  async canUserAccessPedido(user, pedido) {
    if (Number(getRelationId(pedido?.cliente)) === Number(user?.id)) return true;
    if (!isFarmerUser(user)) return false;
    const userStoreId = getRelationId(user?.loja);
    const pedidoStoreId = getRelationId(pedido?.loja);
    return !userStoreId || !pedidoStoreId || userStoreId === pedidoStoreId;
  },

  async createPedido(data = {}, user) {
    const lojaId = getRelationId(data.loja || data.storeId);
    if (!lojaId) throw new Error('Loja é obrigatória para criar o pedido.');

    const loja = await strapi.entityService.findOne('api::loja.loja', lojaId, {
      populate: ['agricultor', 'endereco'],
    });
    if (!loja) throw new Error('Loja não encontrada.');

    const itens = normalizeItens(data.itens || data.items || data.cart || []);
    if (!itens.length) throw new Error('O pedido precisa possuir pelo menos um item.');

    const valorTotal = Number(data.valor_total || data.valor || data.total || totalFromItens(itens));
    if (!valorTotal || Number.isNaN(valorTotal)) throw new Error('Valor total do pedido inválido.');

    const codigo = data.codigo || `PED-${Date.now()}`;
    const pedido = await strapi.entityService.create('api::pedido.pedido', {
      data: {
        codigo,
        status: 'AGUARDANDO_PAGAMENTO',
        tipo_entrega: data.tipo_entrega || data.tipo_de_entrega || 'Receber',
        valor_total: valorTotal,
        itens,
        observacao: data.observacao,
        cliente: user.id,
        loja: lojaId,
        endereco_entrega: data.endereco_entrega || data.endereco || user.endereco?.id,
        historico_status: history('AGUARDANDO_PAGAMENTO', 'Pedido criado pelo cliente no mobile'),
      },
      populate: ['loja', 'cliente', 'endereco_entrega'],
    });

    const chavePix = data.chave_pix || loja.chave_pix || process.env.AGROMART_PIX_KEY || 'pix@agromart.local';
    const nomeRecebedor = data.nome_recebedor || loja.nome_recebedor_pix || loja.nome || 'CSA AGROMART';
    const cidadeRecebedor = data.cidade_recebedor || loja.cidade_recebedor_pix || 'BRASILIA';

    await strapi.service('api::pagamento.pagamento').gerarPix({
      referencia_pedido: pedido.codigo || `Pedido #${pedido.id}`,
      valor: valorTotal,
      chave_pix: chavePix,
      nome_recebedor: nomeRecebedor,
      cidade_recebedor: cidadeRecebedor,
      loja: lojaId,
      consumidor: user.id,
      pedido: pedido.id,
      observacao: `Cobrança gerada automaticamente para o pedido ${pedido.codigo || pedido.id}`,
    }, loja.agricultor || { ...user, role: { name: 'Agricultor' }, loja });

    return this.findOne(pedido.id);
  },

  async updateStatus(id, status, observacao, user) {
    const pedido = await this.findOne(id);
    if (!pedido) throw new Error('Pedido não encontrado.');
    if (!await this.canUserAccessPedido(user, pedido)) throw new Error('Você não tem permissão para alterar este pedido.');
    if (!isFarmerUser(user)) throw new Error('Apenas agricultor/produtor pode alterar o status do pedido.');

    return strapi.entityService.update('api::pedido.pedido', id, {
      data: {
        status,
        observacao: observacao || pedido.observacao,
        historico_status: appendHistory(pedido, status, observacao || 'Status atualizado pelo agricultor'),
      },
      populate: ['loja', 'cliente', 'endereco_entrega'],
    });
  },

  async deletePedido(id, user) {
    const pedido = await this.findOne(id);
    if (!pedido) throw new Error('Pedido não encontrado.');
    if (!await this.canUserAccessPedido(user, pedido)) throw new Error('Você não tem permissão para excluir este pedido.');
    if (!isFarmerUser(user)) throw new Error('Apenas agricultor/produtor pode excluir pedidos.');

    const pagamentos = await strapi.entityService.findMany('api::pagamento.pagamento', {
      filters: { pedido: { id } },
      limit: 100,
    });

    for (const pagamento of pagamentos) {
      await strapi.entityService.delete('api::pagamento.pagamento', pagamento.id);
    }

    return strapi.entityService.delete('api::pedido.pedido', id);
  },
});
