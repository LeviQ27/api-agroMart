'use strict';

const { createCoreController } = require('@strapi/strapi').factories;

const getBearerToken = (ctx) => {
  const authorization = ctx.request.header.authorization || ctx.request.header.Authorization || '';
  return authorization.startsWith('Bearer ') ? authorization.replace('Bearer ', '').trim() : null;
};
const getBodyData = (ctx) => ctx.request.body?.data || ctx.request.body || {};
const isBlank = (value) => value === undefined || value === null || value === '';
const compact = (data) => { Object.keys(data).forEach(key => isBlank(data[key]) && delete data[key]); return data; };
const toNumber = (value) => isBlank(value) ? undefined : Number(value);
const toStringOrUndefined = (value) => isBlank(value) ? undefined : String(value);
const buildProductPayload = (data, loja) => compact({
  nome: toStringOrUndefined(data.nome),
  descricao: toStringOrUndefined(data.descricao),
  valor: toNumber(data.valor),
  quantidade: toNumber(data.quantidade),
  unidade_medida: toStringOrUndefined(data.unidade_medida),
  imagem: getRelationId(data.imagem),
  loja,
  publishedAt: data.publishedAt || new Date().toISOString(),
});
const getRelationId = (relation) => {
  if (!relation) return undefined;
  if (typeof relation === 'number' || typeof relation === 'string') return Number(relation);
  if (relation.id) return Number(relation.id);
  if (relation.data?.id) return Number(relation.data.id);
  return undefined;
};
const getUser = async (ctx) => {
  let id = ctx.state?.user?.id;
  if (!id) {
    const token = getBearerToken(ctx);
    if (!token) return null;
    const decoded = await strapi.plugin('users-permissions').service('jwt').verify(token);
    id = decoded?.id;
  }
  if (!id) return null;
  const user = await strapi.entityService.findOne('plugin::users-permissions.user', id, { populate: ['role', 'loja'] });
  if (user && !user.loja?.id) {
    const lojas = await strapi.entityService.findMany('api::loja.loja', { filters: { agricultor: { id } }, publicationState: 'preview', limit: 1 });
    if (lojas?.[0]) user.loja = lojas[0];
  }
  return user;
};
const populate = { imagem: true, loja: true };

module.exports = createCoreController('api::produto-avulso.produto-avulso', ({ strapi }) => ({
  async find(ctx) {
    const produtos = await strapi.entityService.findMany('api::produto-avulso.produto-avulso', {
      filters: ctx.query?.filters || {},
      publicationState: ctx.query?.publicationState || 'live',
      populate,
      sort: { createdAt: 'desc' },
    });
    ctx.body = { data: produtos };
  },
  async findOne(ctx) {
    const produto = await strapi.entityService.findOne('api::produto-avulso.produto-avulso', ctx.params.id, { publicationState: 'preview', populate });
    if (!produto) return ctx.notFound('Produto não encontrado.');
    ctx.body = { data: produto };
  },
  async create(ctx) {
    const user = await getUser(ctx);
    if (!user) return ctx.unauthorized('Autenticação obrigatória.');
    const data = getBodyData(ctx);
    const loja = getRelationId(data.loja) || getRelationId(user.loja);
    const produto = await strapi.entityService.create('api::produto-avulso.produto-avulso', {
      data: buildProductPayload(data, loja),
      populate,
    });
    ctx.body = { data: produto };
  },
  async update(ctx) {
    const user = await getUser(ctx);
    if (!user) return ctx.unauthorized('Autenticação obrigatória.');
    const data = getBodyData(ctx);
    const produto = await strapi.entityService.update('api::produto-avulso.produto-avulso', ctx.params.id, {
      data: buildProductPayload(data, getRelationId(data.loja)),
      populate,
    });
    ctx.body = { data: produto };
  },
  async delete(ctx) {
    const user = await getUser(ctx);
    if (!user) return ctx.unauthorized('Autenticação obrigatória.');
    const produto = await strapi.entityService.delete('api::produto-avulso.produto-avulso', ctx.params.id);
    ctx.body = { data: produto };
  },
}));
