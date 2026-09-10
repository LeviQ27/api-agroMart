# Módulo de Pagamentos AgroMart

Implementação MVP alinhada ao TCC: geração de cobrança Pix pelo agricultor/produtor, envio de comprovante pelo cliente, aprovação/rejeição manual e estrutura preparada para evolução com OCR/Tesseract.

## Papéis e acesso

- **Interface Web / agricultor familiar / produtor**: acessa a visão administrativa dos pagamentos da própria loja/CSA, gera cobranças Pix, baixa comprovantes, aprova, rejeita ou remove pagamentos.
- **Mobile cliente / coprodutor**: acessa apenas as cobranças vinculadas ao seu usuário autenticado, copia o Pix/QR Code e envia comprovante.
- **Usuário sem login**: não acessa endpoints de pagamento.

A separação é feita no backend, não apenas no frontend. O endpoint administrativo `/api/pagamentos` exige usuário com papel de agricultor/produtor/gestor/admin ou usuário vinculado a uma `loja`. O endpoint do cliente é `/api/pagamentos/me` e filtra por `consumidor = usuário autenticado`.

## Endpoints

### Agricultor/produtor, via interface web

- `GET /api/pagamentos`
- `GET /api/pagamentos/:id`
- `POST /api/pagamentos/gerar-pix`
- `PUT /api/pagamentos/:id/aprovar`
- `PUT /api/pagamentos/:id/rejeitar`
- `DELETE /api/pagamentos/:id`

### Cliente, via mobile

- `GET /api/pagamentos/me`
- `GET /api/pagamentos/:id` apenas quando o pagamento pertence ao usuário
- `POST /api/pagamentos/:id/comprovante` apenas quando o pagamento pertence ao usuário

## Exemplo de geração Pix

```json
{
  "data": {
    "referencia_pedido": "PED-001",
    "valor": 35.50,
    "chave_pix": "pix@csa.org",
    "nome_recebedor": "CSA AGROMART",
    "cidade_recebedor": "BRASILIA",
    "loja": 1,
    "consumidor": 4
  }
}
```

Para que o pagamento apareça no mobile, o campo `consumidor` precisa estar vinculado ao usuário cliente. Na evolução com pedidos/extratos, esse vínculo deve ser preenchido automaticamente a partir do pedido.
