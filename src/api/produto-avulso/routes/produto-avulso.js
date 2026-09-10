'use strict';

module.exports = {
  routes: [
    { method: 'GET', path: '/produtos-avulsos', handler: 'produto-avulso.find', config: { auth: false } },
    { method: 'GET', path: '/produtos-avulsos/:id', handler: 'produto-avulso.findOne', config: { auth: false } },
    { method: 'POST', path: '/produtos-avulsos', handler: 'produto-avulso.create', config: { auth: false } },
    { method: 'PUT', path: '/produtos-avulsos/:id', handler: 'produto-avulso.update', config: { auth: false } },
    { method: 'DELETE', path: '/produtos-avulsos/:id', handler: 'produto-avulso.delete', config: { auth: false } },
  ],
};
