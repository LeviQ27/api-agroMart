'use strict';

module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/pagamentos',
      handler: 'pagamento.find',
      config: { auth: false },
    },
    {
      method: 'GET',
      path: '/pagamentos/me',
      handler: 'pagamento.findMine',
      config: { auth: false },
    },
    {
      method: 'GET',
      path: '/pagamentos/:id',
      handler: 'pagamento.findOne',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/pagamentos/gerar-pix',
      handler: 'pagamento.gerarPix',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/pagamentos/:id/comprovante',
      handler: 'pagamento.enviarComprovante',
      config: { auth: false },
    },
    {
      method: 'PUT',
      path: '/pagamentos/:id/aprovar',
      handler: 'pagamento.aprovar',
      config: { auth: false },
    },
    {
      method: 'PUT',
      path: '/pagamentos/:id/rejeitar',
      handler: 'pagamento.rejeitar',
      config: { auth: false },
    },
    {
      method: 'DELETE',
      path: '/pagamentos/:id',
      handler: 'pagamento.delete',
      config: { auth: false },
    },
  ],
};
