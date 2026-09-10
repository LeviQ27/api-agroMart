'use strict';

const getBodyData = (ctx) => {
  const rawData = ctx.request.body?.data || ctx.request.body || {};
  if (typeof rawData === 'string') {
    try {
      return JSON.parse(rawData);
    } catch (error) {
      return { observacao: rawData };
    }
  }
  return rawData;
};

const ok = (ctx, data) => { ctx.status = 200; ctx.body = { data }; };
const fail = (ctx, error, status = 400) => {
  ctx.status = status;
  ctx.body = { error: { message: error.message || 'Erro ao processar pagamento' } };
};

const getBearerToken = (ctx) => {
  const authorization = ctx.request.header.authorization || ctx.request.header.Authorization || '';
  if (!authorization.startsWith('Bearer ')) return null;
  return authorization.replace('Bearer ', '').trim();
};

const getAuthenticatedUser = async (ctx) => {
  if (ctx.state?.user?.id) {
    const user = await strapi.entityService.findOne('plugin::users-permissions.user', ctx.state.user.id, {
      populate: ['role', 'loja'],
    });
    if (user && !user.loja?.id) {
      const lojas = await strapi.entityService.findMany('api::loja.loja', {
        filters: { agricultor: { id: user.id } },
        publicationState: 'preview',
        limit: 1,
      });
      if (lojas?.[0]) user.loja = lojas[0];
    }
    return user;
  }

  const token = getBearerToken(ctx);
  if (!token) return null;

  const jwtService = strapi.plugin('users-permissions').service('jwt');
  const decoded = await jwtService.verify(token);
  if (!decoded?.id) return null;

  const user = await strapi.entityService.findOne('plugin::users-permissions.user', decoded.id, {
    populate: ['role', 'loja'],
  });

  if (user && !user.loja?.id) {
    const lojas = await strapi.entityService.findMany('api::loja.loja', {
      filters: { agricultor: { id: user.id } },
      publicationState: 'preview',
      limit: 1,
    });
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
    const error = new Error('Autenticação obrigatória. Faça login para acessar pagamentos.');
    error.status = 401;
    throw error;
  }
  return user;
};

const requireFarmer = async (ctx) => {
  const user = await requireUser(ctx);
  if (!isFarmerUser(user)) {
    const error = new Error('Acesso restrito ao agricultor familiar/produtor pela interface web.');
    error.status = 403;
    throw error;
  }
  return user;
};

const handle = async (ctx, callback) => {
  try {
    await callback();
  } catch (error) {
    fail(ctx, error, error.status || 400);
  }
};

module.exports = {
  async find(ctx) {
    return handle(ctx, async () => {
      const user = await requireFarmer(ctx);
      const pagamentos = await strapi.service('api::pagamento.pagamento').findForFarmer(user);
      ok(ctx, pagamentos);
    });
  },

  async findMine(ctx) {
    return handle(ctx, async () => {
      const user = await requireUser(ctx);
      const pagamentos = await strapi.service('api::pagamento.pagamento').findForConsumer(user.id);
      ok(ctx, pagamentos);
    });
  },

  async findOne(ctx) {
    return handle(ctx, async () => {
      const user = await requireUser(ctx);
      const pagamento = await strapi.service('api::pagamento.pagamento').findOne(ctx.params.id);
      if (!pagamento) {
        const error = new Error('Pagamento não encontrado');
        error.status = 404;
        throw error;
      }

      const canAccess = await strapi.service('api::pagamento.pagamento').canUserAccessPayment(user, pagamento);
      if (!canAccess) {
        const error = new Error('Você não tem permissão para acessar este pagamento.');
        error.status = 403;
        throw error;
      }

      ok(ctx, pagamento);
    });
  },

  async gerarPix(ctx) {
    return handle(ctx, async () => {
      const user = await requireFarmer(ctx);
      const data = getBodyData(ctx);
      const required = ['chave_pix', 'nome_recebedor'];
      const missing = required.filter((field) => data[field] === undefined || data[field] === null || data[field] === '');
      if (missing.length) throw new Error(`Campos obrigatórios ausentes: ${missing.join(', ')}`);
      const pagamento = await strapi.service('api::pagamento.pagamento').gerarPix(data, user);
      ok(ctx, pagamento);
    });
  },

  async enviarComprovante(ctx) {
    return handle(ctx, async () => {
      const user = await requireUser(ctx);
      const pagamento = await strapi.service('api::pagamento.pagamento').enviarComprovante(
        ctx.params.id,
        getBodyData(ctx),
        ctx.request.files,
        user,
      );
      ok(ctx, pagamento);
    });
  },

  async aprovar(ctx) {
    return handle(ctx, async () => {
      const user = await requireFarmer(ctx);
      const data = getBodyData(ctx);
      const pagamento = await strapi.service('api::pagamento.pagamento').aprovar(ctx.params.id, data.observacao, user);
      ok(ctx, pagamento);
    });
  },

  async rejeitar(ctx) {
    return handle(ctx, async () => {
      const user = await requireFarmer(ctx);
      const data = getBodyData(ctx);
      const pagamento = await strapi.service('api::pagamento.pagamento').rejeitar(ctx.params.id, data.motivo || data.observacao, user);
      ok(ctx, pagamento);
    });
  },

  async delete(ctx) {
    return handle(ctx, async () => {
      const user = await requireFarmer(ctx);
      const pagamento = await strapi.service('api::pagamento.pagamento').excluir(ctx.params.id, user);
      ok(ctx, pagamento);
    });
  },
};
