'use strict';

module.exports = {
  routes: [
    { method: 'GET', path: '/pedidos', handler: 'pedido.find', config: { auth: false } },
    { method: 'GET', path: '/pedidos/me', handler: 'pedido.findMine', config: { auth: false } },
    { method: 'GET', path: '/pedidos/:id', handler: 'pedido.findOne', config: { auth: false } },
    { method: 'POST', path: '/pedidos', handler: 'pedido.create', config: { auth: false } },
    { method: 'PUT', path: '/pedidos/:id/status', handler: 'pedido.updateStatus', config: { auth: false } },
    { method: 'DELETE', path: '/pedidos/:id', handler: 'pedido.delete', config: { auth: false } },
  ],
};
