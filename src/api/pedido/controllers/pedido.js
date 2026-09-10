'use strict';

const getBodyData = (ctx) => {
  const rawData = ctx.request.body?.data || ctx.request.body || {};
  if (typeof rawData === 'string') {
    try { return JSON.parse(rawData); } catch (error) { return { observacao: rawData }; }
  }
  return rawData;
};

const ok = (ctx, data) => { ctx.status = 200; ctx.body = { data }; };
const fail = (ctx, error, status = 400) => {
  ctx.status = status;
  ctx.body = { error: { message: error.message || 'Erro ao processar pedido' } };
};

const getBearerToken = (ctx) => {
  const authorization = ctx.request.header.authorization || ctx.request.header.Authorization || '';
  if (!authorization.startsWith('Bearer ')) return null;
  return authorization.replace('Bearer ', '').trim();
};

const getAuthenticatedUser = async (ctx) => {
  if (ctx.state?.user?.id) {
    const user = await strapi.entityService.findOne('plugin::users-permissions.user', ctx.state.user.id, { populate: ['role', 'loja', 'endereco'] });
    if (user && !user.loja?.id) {
      const lojas = await strapi.entityService.findMany('api::loja.loja', { filters: { agricultor: { id: user.id } }, publicationState: 'preview', limit: 1 });
      if (lojas?.[0]) user.loja = lojas[0];
    }
    return user;
  }
  const token = getBearerToken(ctx);
  if (!token) return null;
  const jwtService = strapi.plugin('users-permissions').service('jwt');
  const decoded = await jwtService.verify(token);
  if (!decoded?.id) return null;
  const user = await strapi.entityService.findOne('plugin::users-permissions.user', decoded.id, { populate: ['role', 'loja', 'endereco'] });
  if (user && !user.loja?.id) {
    const lojas = await strapi.entityService.findMany('api::loja.loja', { filters: { agricultor: { id: user.id } }, publicationState: 'preview', limit: 1 });
    if (lojas?.[0]) user.loja = lojas[0];
  }
  return user;
};

const normalizeRole = (role = {}) => String(role.name || role.code || role.type || '').toLowerCase();
const isFarmerUser = (user = {}) => {
  const role = normalizeRole(user.role);
  const farmerTerms = ['agricultor', 'produtor', 'producer', 'farmer', 'gestor', 'manager', 'admin'];
  return Boolean(user.loja?.id) || farmerTerms.some(term => role.includes(term));
};

const requireUser = async (ctx) => {
  const user = await getAuthenticatedUser(ctx);
  if (!user) {
    const error = new Error('Autenticação obrigatória.');
    error.status = 401;
    throw error;
  }
  return user;
};

const requireFarmer = async (ctx) => {
  const user = await requireUser(ctx);
  if (!isFarmerUser(user)) {
    const error = new Error('Acesso restrito ao agricultor familiar/produtor.');
    error.status = 403;
    throw error;
  }
  return user;
};

const handle = async (ctx, callback) => {
  try { await callback(); } catch (error) { fail(ctx, error, error.status || 400); }
};

module.exports = {
  async find(ctx) {
    return handle(ctx, async () => {
      const user = await requireFarmer(ctx);
      ok(ctx, await strapi.service('api::pedido.pedido').findForFarmer(user));
    });
  },
  async findMine(ctx) {
    return handle(ctx, async () => {
      const user = await requireUser(ctx);
      ok(ctx, await strapi.service('api::pedido.pedido').findForConsumer(user.id));
    });
  },
  async findOne(ctx) {
    return handle(ctx, async () => {
      const user = await requireUser(ctx);
      const pedido = await strapi.service('api::pedido.pedido').findOne(ctx.params.id);
      if (!pedido) { const error = new Error('Pedido não encontrado.'); error.status = 404; throw error; }
      if (!await strapi.service('api::pedido.pedido').canUserAccessPedido(user, pedido)) {
        const error = new Error('Você não tem permissão para acessar este pedido.'); error.status = 403; throw error;
      }
      ok(ctx, pedido);
    });
  },
  async create(ctx) {
    return handle(ctx, async () => {
      const user = await requireUser(ctx);
      ok(ctx, await strapi.service('api::pedido.pedido').createPedido(getBodyData(ctx), user));
    });
  },
  async updateStatus(ctx) {
    return handle(ctx, async () => {
      const user = await requireFarmer(ctx);
      const data = getBodyData(ctx);
      ok(ctx, await strapi.service('api::pedido.pedido').updateStatus(ctx.params.id, data.status, data.observacao, user));
    });
  },

  async delete(ctx) {
    return handle(ctx, async () => {
      const user = await requireFarmer(ctx);
      ok(ctx, await strapi.service('api::pedido.pedido').deletePedido(ctx.params.id, user));
    });
  },
};
