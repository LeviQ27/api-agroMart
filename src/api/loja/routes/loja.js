'use strict';

module.exports = {
  routes: [
    { method: 'GET', path: '/lojas', handler: 'loja.find', config: { auth: false } },
    { method: 'GET', path: '/lojas/me', handler: 'loja.findMine', config: { auth: false } },
    { method: 'GET', path: '/lojas/minhas', handler: 'loja.findMyStores', config: { auth: false } },
    { method: 'PUT', path: '/lojas/me', handler: 'loja.upsertMine', config: { auth: false } },
    { method: 'POST', path: '/lojas/me', handler: 'loja.upsertMine', config: { auth: false } },
    { method: 'GET', path: '/lojas/:id', handler: 'loja.findOne', config: { auth: false } },
    { method: 'POST', path: '/lojas', handler: 'loja.create', config: { auth: false } },
    { method: 'PUT', path: '/lojas/:id', handler: 'loja.update', config: { auth: false } },
    { method: 'PUT', path: '/lojas/:id/publicar', handler: 'loja.publish', config: { auth: false } },
    { method: 'DELETE', path: '/lojas/:id', handler: 'loja.delete', config: { auth: false } },
  ],
};
