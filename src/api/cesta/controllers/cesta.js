'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const getBearerToken = (ctx) => {
  const authorization = ctx.request.header.authorization || ctx.request.header.Authorization || '';
  return authorization.startsWith('Bearer ') ? authorization.replace('Bearer ', '').trim() : null;
};
const getBodyData = (ctx) => ctx.request.body?.data || ctx.request.body || {};
const compact = (data) => { Object.keys(data).forEach(key => data[key] === undefined && delete data[key]); return data; };
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

module.exports = createCoreController('api::cesta.cesta', ({ strapi }) => ({
  async find(ctx) {
    const cestas = await strapi.entityService.findMany('api::cesta.cesta', {
      filters: ctx.query?.filters || {},
      publicationState: ctx.query?.publicationState || 'live',
      populate,
      sort: { createdAt: 'desc' },
    });
    ctx.body = { data: cestas };
  },
  async findOne(ctx) {
    const cesta = await strapi.entityService.findOne('api::cesta.cesta', ctx.params.id, { publicationState: 'preview', populate });
    if (!cesta) return ctx.notFound('Cesta não encontrada.');
    ctx.body = { data: cesta };
  },
  async create(ctx) {
    const user = await getUser(ctx);
    if (!user) return ctx.unauthorized('Autenticação obrigatória.');
    const data = getBodyData(ctx);
    const loja = getRelationId(data.loja) || getRelationId(user.loja);
    const cesta = await strapi.entityService.create('api::cesta.cesta', {
      data: compact({ ...data, loja, publishedAt: data.publishedAt || new Date().toISOString() }),
      populate,
    });
    ctx.body = { data: cesta };
  },
  async update(ctx) {
    const user = await getUser(ctx);
    if (!user) return ctx.unauthorized('Autenticação obrigatória.');
    const data = getBodyData(ctx);
    const cesta = await strapi.entityService.update('api::cesta.cesta', ctx.params.id, {
      data: compact({ ...data, publishedAt: data.publishedAt || new Date().toISOString() }),
      populate,
    });
    ctx.body = { data: cesta };
  },
  async delete(ctx) {
    const user = await getUser(ctx);
    if (!user) return ctx.unauthorized('Autenticação obrigatória.');
    const cesta = await strapi.entityService.delete('api::cesta.cesta', ctx.params.id);
    ctx.body = { data: cesta };
  },
}));
