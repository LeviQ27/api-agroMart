'use strict';

module.exports = {
  routes: [
    { method: 'GET', path: '/cestas', handler: 'cesta.find', config: { auth: false } },
    { method: 'GET', path: '/cestas/:id', handler: 'cesta.findOne', config: { auth: false } },
    { method: 'POST', path: '/cestas', handler: 'cesta.create', config: { auth: false } },
    { method: 'PUT', path: '/cestas/:id', handler: 'cesta.update', config: { auth: false } },
    { method: 'DELETE', path: '/cestas/:id', handler: 'cesta.delete', config: { auth: false } },
  ],
};
