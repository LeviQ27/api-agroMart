"use strict";

const { createCoreController } = require("@strapi/strapi").factories;

const getBearerToken = (ctx) => {
  const authorization = ctx.request.header.authorization || ctx.request.header.Authorization || '';
  if (!authorization.startsWith('Bearer ')) return null;
  return authorization.replace('Bearer ', '').trim();
};

const getAuthenticatedUser = async (ctx) => {
  let userId = ctx.state?.user?.id;
  if (!userId) {
    const token = getBearerToken(ctx);
    if (!token) return null;
    const jwtService = strapi.plugin('users-permissions').service('jwt');
    const decoded = await jwtService.verify(token);
    userId = decoded?.id;
  }
  if (!userId) return null;

  const user = await strapi.entityService.findOne('plugin::users-permissions.user', userId, {
    populate: ['role', 'loja', 'endereco'],
  });

  if (!user?.loja?.id) {
    const lojas = await strapi.entityService.findMany('api::loja.loja', {
      filters: { agricultor: { id: userId } },
      publicationState: 'preview',
      limit: 1,
    });
    if (lojas?.[0]) user.loja = lojas[0];
  }

  return user;
};

const getBodyData = (ctx) => ctx.request.body?.data || ctx.request.body || {};

const isBlank = (value) => value === undefined || value === null || value === '';

const compact = (payload) => {
  Object.keys(payload).forEach((key) => {
    if (isBlank(payload[key])) delete payload[key];
  });
  return payload;
};

const toBigInteger = (value) => {
  if (isBlank(value)) return undefined;
  const onlyDigits = String(value).replace(/\D/g, '');
  return onlyDigits || undefined;
};

const toStringOrUndefined = (value) => isBlank(value) ? undefined : String(value);

const toEnumOrUndefined = (value) => isBlank(value) ? undefined : value;


const getRelationId = (relation) => {
  if (!relation) return undefined;
  if (typeof relation === 'number' || typeof relation === 'string') return Number(relation);
  if (relation.id) return Number(relation.id);
  if (relation.data?.id) return Number(relation.data.id);
  return undefined;
};

const normalizeIds = (value) => {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) {
    const ids = value.map(getRelationId).filter(Boolean);
    return ids.length ? ids : undefined;
  }
  const id = getRelationId(value);
  return id ? [id] : undefined;
};

const populateLoja = {
  banner: true,
  endereco: true,
  agricultor: true,
  planos: { populate: { imagem: true, assinantes: true } },
  assinantes: { populate: { usuario: true, planos: true } },
  cestas: { populate: { imagem: true } },
  produto_avulsos: { populate: { imagem: true } },
};

const buildEnderecoPayload = (data = {}) => {
  const endereco = data.endereco || data.address || data;
  if (!endereco) return null;
  const hasAddressField = ['cep', 'rua', 'numero', 'bairro', 'cidade', 'complemento'].some((field) => endereco[field] !== undefined && endereco[field] !== null && endereco[field] !== '');
  if (!hasAddressField) return null;

  return compact({
    cep: toStringOrUndefined(endereco.cep),
    rua: toStringOrUndefined(endereco.rua),
    numero: !isBlank(endereco.numero) ? Number(String(endereco.numero).replace(/\D/g, '')) : undefined,
    bairro: toStringOrUndefined(endereco.bairro),
    cidade: toStringOrUndefined(endereco.cidade) || 'Brasília',
    complemento: toStringOrUndefined(endereco.complemento),
  });
};

const upsertEndereco = async (data = {}, currentEnderecoId) => {
  const enderecoPayload = buildEnderecoPayload(data);
  if (!enderecoPayload) return undefined;

  if (currentEnderecoId) {
    const updated = await strapi.entityService.update('api::endereco.endereco', currentEnderecoId, {
      data: enderecoPayload,
    });
    return updated.id;
  }

  const created = await strapi.entityService.create('api::endereco.endereco', {
    data: enderecoPayload,
  });
  return created.id;
};

const buildLojaPayload = async (data = {}, user, lojaAtual = null) => {
  const enderecoId = await upsertEndereco(data, getRelationId(lojaAtual?.endereco));
  const planos = normalizeIds(data.planos || data.plans);
  const assinantes = normalizeIds(data.assinantes || data.subscribers);
  const produtos = normalizeIds(data.produto_avulsos || data.produtos || data.products);
  const cestas = normalizeIds(data.cestas || data.baskets);

  const payload = compact({
    nome: toStringOrUndefined(data.nome),
    descricao: toStringOrUndefined(data.descricao),
    contato: toBigInteger(data.contato),
    cnpj: toBigInteger(data.cnpj),
    tipos_de_entrega: toEnumOrUndefined(data.tipos_de_entrega || data.tipo_entrega),
    regiao_administrativa: toStringOrUndefined(data.regiao_administrativa || data.bairro || data.endereco?.bairro),
    chave_pix: toStringOrUndefined(data.chave_pix),
    nome_recebedor_pix: toStringOrUndefined(data.nome_recebedor_pix || data.nome_recebedor || data.nome),
    cidade_recebedor_pix: toStringOrUndefined(data.cidade_recebedor_pix || data.cidade_recebedor) || 'BRASILIA',
    banner: getRelationId(data.banner),
    endereco: enderecoId,
    agricultor: getRelationId(data.agricultor) || user?.id,
    publishedAt: data.publicar === false || data.publishedAt === null ? null : (data.publicar || data.publish || data.publishedAt ? new Date().toISOString() : undefined),
  });

  if (planos) payload.planos = planos;
  if (assinantes) payload.assinantes = assinantes;
  if (produtos) payload.produto_avulsos = produtos;
  if (cestas) payload.cestas = cestas;

  return payload;
};

const ensureOwner = async (user, loja) => {
  if (!user || !loja) return false;
  const role = String(user.role?.name || user.role?.code || '').toLowerCase();
  if (role.includes('admin')) return true;
  const userStoreId = getRelationId(user.loja);
  const lojaId = getRelationId(loja);
  const agricultorId = getRelationId(loja.agricultor);
  return userStoreId === lojaId || agricultorId === Number(user.id);
};

module.exports = createCoreController("api::loja.loja", ({ strapi }) => ({
  async find(ctx) {
    try {
      const lojas = await strapi.entityService.findMany('api::loja.loja', {
        publicationState: ctx.query?.publicationState || 'live',
        filters: ctx.query?.filters || {},
        populate: populateLoja,
        sort: { createdAt: 'desc' },
      });
      ctx.body = { data: lojas };
    } catch (err) {
      ctx.throw(500, err);
    }
  },

  async findOne(ctx) {
    try {
      const loja = await strapi.entityService.findOne('api::loja.loja', ctx.params.id, {
        publicationState: 'preview',
        populate: populateLoja,
      });
      if (!loja) return ctx.notFound('Loja não encontrada.');
      ctx.body = { data: loja };
    } catch (err) {
      ctx.throw(500, err);
    }
  },

  async findMine(ctx) {
    try {
      const user = await getAuthenticatedUser(ctx);
      if (!user) return ctx.unauthorized('Autenticação obrigatória.');

      const lojas = await strapi.entityService.findMany('api::loja.loja', {
        filters: { agricultor: { id: user.id } },
        publicationState: 'preview',
        populate: populateLoja,
        sort: { createdAt: 'desc' },
      });

      let loja = lojas?.[0] || null;
      if (!loja && user.loja?.id) {
        loja = await strapi.entityService.findOne('api::loja.loja', user.loja.id, {
          publicationState: 'preview',
          populate: populateLoja,
        });
      }

      ctx.body = { data: loja, meta: { lojas } };
    } catch (err) {
      ctx.throw(500, err);
    }
  },

  async findMyStores(ctx) {
    try {
      const user = await getAuthenticatedUser(ctx);
      if (!user) return ctx.unauthorized('Autenticação obrigatória.');

      const lojas = await strapi.entityService.findMany('api::loja.loja', {
        filters: { agricultor: { id: user.id } },
        publicationState: 'preview',
        populate: populateLoja,
        sort: { createdAt: 'desc' },
      });
      ctx.body = { data: lojas };
    } catch (err) {
      ctx.throw(500, err);
    }
  },

  async upsertMine(ctx) {
    try {
      const user = await getAuthenticatedUser(ctx);
      if (!user) return ctx.unauthorized('Autenticação obrigatória.');

      const data = getBodyData(ctx);
      const lojaId = data.id || getRelationId(user.loja);
      const lojaAtual = lojaId ? await strapi.entityService.findOne('api::loja.loja', lojaId, { publicationState: 'preview', populate: populateLoja }) : null;
      const payload = await buildLojaPayload(data, user, lojaAtual);

      let loja;
      if (lojaAtual) {
        loja = await strapi.entityService.update('api::loja.loja', lojaAtual.id, { data: payload, populate: populateLoja });
      } else {
        loja = await strapi.entityService.create('api::loja.loja', { data: compact({ ...payload, publishedAt: payload.publishedAt || new Date().toISOString() }), populate: populateLoja });
        try { await strapi.entityService.update('plugin::users-permissions.user', user.id, { data: { loja: loja.id } }); } catch (error) {}
      }

      ctx.body = { data: loja };
    } catch (err) {
      ctx.throw(500, err);
    }
  },

  async create(ctx) {
    try {
      const user = await getAuthenticatedUser(ctx);
      if (!user) return ctx.unauthorized('Autenticação obrigatória.');
      const data = getBodyData(ctx);
      const payload = await buildLojaPayload({ ...data, publish: data.publish ?? true }, user);
      const loja = await strapi.entityService.create('api::loja.loja', {
        data: compact({ ...payload, publishedAt: payload.publishedAt || new Date().toISOString() }),
        populate: populateLoja,
      });
      ctx.body = { data: loja };
    } catch (err) {
      ctx.throw(500, err);
    }
  },

  async update(ctx) {
    try {
      const user = await getAuthenticatedUser(ctx);
      if (!user) return ctx.unauthorized('Autenticação obrigatória.');
      const lojaAtual = await strapi.entityService.findOne('api::loja.loja', ctx.params.id, { publicationState: 'preview', populate: populateLoja });
      if (!lojaAtual) return ctx.notFound('Loja não encontrada.');
      if (!await ensureOwner(user, lojaAtual)) return ctx.forbidden('Você só pode alterar lojas vinculadas ao seu usuário agricultor/produtor.');

      const payload = await buildLojaPayload(getBodyData(ctx), user, lojaAtual);
      const loja = await strapi.entityService.update('api::loja.loja', ctx.params.id, { data: payload, populate: populateLoja });
      ctx.body = { data: loja };
    } catch (err) {
      ctx.throw(500, err);
    }
  },

  async publish(ctx) {
    try {
      const user = await getAuthenticatedUser(ctx);
      if (!user) return ctx.unauthorized('Autenticação obrigatória.');
      const lojaAtual = await strapi.entityService.findOne('api::loja.loja', ctx.params.id, { publicationState: 'preview', populate: populateLoja });
      if (!lojaAtual) return ctx.notFound('Loja não encontrada.');
      if (!await ensureOwner(user, lojaAtual)) return ctx.forbidden('Você só pode publicar lojas vinculadas ao seu usuário agricultor/produtor.');
      const loja = await strapi.entityService.update('api::loja.loja', ctx.params.id, {
        data: { publishedAt: new Date().toISOString() },
        populate: populateLoja,
      });
      ctx.body = { data: loja };
    } catch (err) {
      ctx.throw(500, err);
    }
  },

  async delete(ctx) {
    try {
      const user = await getAuthenticatedUser(ctx);
      if (!user) return ctx.unauthorized('Autenticação obrigatória.');
      const lojaAtual = await strapi.entityService.findOne('api::loja.loja', ctx.params.id, { publicationState: 'preview', populate: populateLoja });
      if (!lojaAtual) return ctx.notFound('Loja não encontrada.');
      if (!await ensureOwner(user, lojaAtual)) return ctx.forbidden('Você só pode excluir lojas vinculadas ao seu usuário agricultor/produtor.');
      const loja = await strapi.entityService.delete('api::loja.loja', ctx.params.id);
      ctx.body = { data: loja };
    } catch (err) {
      ctx.throw(500, err);
    }
  },
}));
