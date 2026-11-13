# Pratos em realidade aumentada

## Fluxo implementado

O estabelecimento cadastra no item um modelo GLB HTTPS, opcionalmente uma versão USDZ, e descreve a porção. O cliente abre “Ver prato em 3D” e pode girar o modelo. Quando as medidas forem conferidas pelo estabelecimento e o aparelho suportar RA, aparece “Ver na minha mesa”. O recurso usa model-viewer instalado no projeto, carregado apenas ao abrir a visualização, com WebXR, Scene Viewer e Quick Look. A escala em RA fica fixa, mas o rastreamento do aparelho continua aproximado. O modelo não reconhece qual prato está na frente da câmera: ele projeta o prato selecionado na superfície.

Sem suporte a RA, permanece o 3D. Falhas de carregamento mostram a foto e permitem continuar no cardápio. Sem modelo cadastrado, não aparece um botão prometendo RA. Não há modelos de pratos reais incluídos nesta entrega.

## Produção do primeiro catálogo

1. Selecione 3 pratos representativos e estáveis no preparo. Use a porção, louça e montagem realmente servidas.
2. Registre peso, número de pessoas, diâmetro do prato e altura da montagem. Faça fotos em várias voltas e alturas, com iluminação difusa, mantendo o prato parado. Use referência de escala. Ingredientes brilhantes, líquidos e translúcidos exigem mais trabalho de reconstrução.
3. Reconstrua por fotogrametria ou contrate modelagem. Ajuste geometria e texturas comparando com a porção física. Uma única foto ou uma imagem gerada por IA não garante a geometria nem a escala corretas.
4. Exporte GLB com unidades em metros, eixo vertical correto e origem na base da louça. Verifique texturas e iluminação; prefira um modelo leve, com alvo inicial abaixo de 5 MB. USDZ pode ser fornecido para iPhone; mantenha exatamente as mesmas dimensões nos dois formatos.
5. Hospede em Storage/CDN sob seu controle, com URL pública HTTPS permanente e CORS permitido para o site. Os formatos devem ser realmente GLB/USDZ, não páginas de compartilhamento. Use política de upload restrita ao proprietário; o cadastro atual recebe URLs, não cria um bucket de modelos automaticamente.
6. Cadastre o modelo e a porção. Teste em Android e iPhone reais, numa mesa com boa luz, comparando o prato virtual com uma régua e a louça física. Só então marque a confirmação de medidas. Trocar qualquer URL de modelo desmarca essa confirmação.
7. Faça teste sem permissão da câmera, com aparelho incompatível, arquivo indisponível e conexão lenta. O pedido deve continuar funcionando em todos esses casos.

## Limites e teste do piloto

Uma visualização no desktop não valida câmera, rastreamento ou fidelidade da porção. O aplicativo não corrige automaticamente modelos com escala errada. Medidas e porções textuais continuam visíveis; não prometa precisão de medição pela câmera.

Meça a abertura do 3D, início da RA, falhas e pedidos por item antes de decidir modelar o catálogo completo. Esses eventos de análise são próximos passos e não foram adicionados nesta entrega. Compare com períodos equivalentes e considere preço, posição no cardápio e disponibilidade antes de atribuir mudanças de vendas à RA.

Referências: https://modelviewer.dev/examples/augmented-reality.html e https://modelviewer.dev/docs/index.html.
