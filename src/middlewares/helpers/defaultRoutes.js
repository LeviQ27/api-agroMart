function isDefaultRoute(url) {
    if (!url.startsWith('/admin')
        && !url.startsWith('/i18n')
        && !url.startsWith('/content')
        && !url.startsWith('/upload')
        && !url.startsWith('/expo-notifications')
        && !url.startsWith('/plugins')
        && !url.startsWith('/pagamento')
        && !url.startsWith('/api/pagamentos')
        && !url.startsWith('/api/pagamento')
        && !url.startsWith('/api/pedidos')
        && !url.startsWith('/api/lojas')
        && !url.startsWith('/api/produtos-avulsos')
        && !url.startsWith('/api/cestas')
        && !url.startsWith('/api/planos')
        && !url.startsWith('/api/assinantes')
        && !url.startsWith('/users-permissions')
        && !url.startsWith('/auth/google')
        && !url.startsWith('/auth/facebook')
        && !url.startsWith('/auth/github')
        && !url.startsWith('/email')
        && !url.startsWith('/_health')        
        && url != '/'
        && url != '' ){
        return false
    } else{
        return true
    }
}

module.exports = { isDefaultRoute };
