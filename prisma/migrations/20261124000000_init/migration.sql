-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Papel" AS ENUM ('VENDEDOR', 'GERENTE', 'FINANCEIRO', 'ADMINISTRADOR');

-- CreateEnum
CREATE TYPE "StatusCliente" AS ENUM ('ATIVO', 'BLOQUEADO', 'INATIVO');

-- CreateEnum
CREATE TYPE "StatusPedido" AS ENUM ('RASCUNHO', 'ENVIANDO', 'ENVIADO_AO_ERP', 'ERRO_DE_ENVIO', 'BLOQUEADO_POR_CREDITO', 'AGUARDANDO_FINANCEIRO', 'APROVADO', 'RECUSADO');

-- CreateEnum
CREATE TYPE "OrigemTitulo" AS ENUM ('ERP', 'PLANILHA');

-- CreateEnum
CREATE TYPE "StatusTitulo" AS ENUM ('EM_ABERTO', 'VENCIDO', 'PAGO');

-- CreateEnum
CREATE TYPE "TipoDocumento" AS ENUM ('PEDIDO', 'CONTRATO', 'OUTRO');

-- CreateEnum
CREATE TYPE "SituacaoDocumento" AS ENUM ('ENVIADO', 'EM_TRIAGEM', 'AGUARDANDO_CONFIRMACAO', 'CONFIRMADO', 'DESCARTADO', 'ERRO');

-- CreateEnum
CREATE TYPE "FaixaRisco" AS ENUM ('BAIXO', 'MEDIO', 'ALTO');

-- CreateEnum
CREATE TYPE "TipoRegistro" AS ENUM ('SINCRONIZACAO_CLIENTES', 'SINCRONIZACAO_PRODUTOS', 'SINCRONIZACAO_TITULOS', 'CARGA_HISTORICO');

-- CreateEnum
CREATE TYPE "ResultadoRegistro" AS ENUM ('EM_ANDAMENTO', 'SUCESSO', 'PARCIAL', 'FALHA');

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "papel" "Papel" NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "codigoVendedor" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cliente" (
    "id" TEXT NOT NULL,
    "codigoErp" TEXT NOT NULL,
    "razaoSocial" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "cidade" TEXT NOT NULL,
    "uf" CHAR(2) NOT NULL,
    "segmento" TEXT NOT NULL,
    "codigoVendedor" TEXT NOT NULL,
    "limiteCreditoCentavos" INTEGER NOT NULL,
    "status" "StatusCliente" NOT NULL,
    "atualizadoNoErpEm" TIMESTAMP(3) NOT NULL,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Produto" (
    "id" TEXT NOT NULL,
    "codigoErp" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "unidade" TEXT NOT NULL,
    "precoTabelaCentavos" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL,
    "atualizadoNoErpEm" TIMESTAMP(3) NOT NULL,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Produto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Titulo" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "parcela" INTEGER NOT NULL,
    "clienteId" TEXT NOT NULL,
    "pedidoErp" TEXT NOT NULL,
    "valorCentavos" INTEGER NOT NULL,
    "emissao" DATE NOT NULL,
    "vencimento" DATE NOT NULL,
    "pagamento" DATE,
    "status" "StatusTitulo" NOT NULL,
    "origem" "OrigemTitulo" NOT NULL,
    "atualizadoNoErpEm" TIMESTAMP(3),
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Titulo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contrato" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "inicio" DATE NOT NULL,
    "fim" DATE NOT NULL,
    "avisoPrevioDias" INTEGER NOT NULL,
    "renovacaoAutomatica" BOOLEAN NOT NULL,
    "prazoPagamentoDias" INTEGER,
    "volumeMinimoCentavos" INTEGER,
    "temAditivo" BOOLEAN NOT NULL DEFAULT false,
    "dataLimiteAviso" DATE NOT NULL,
    "arquivo" TEXT NOT NULL,
    "documentoId" TEXT,
    "avisoTratadoPorId" TEXT,
    "avisoTratadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contrato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pedido" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "status" "StatusPedido" NOT NULL DEFAULT 'RASCUNHO',
    "totalCentavos" INTEGER NOT NULL,
    "numeroErp" TEXT,
    "chaveEnvio" TEXT NOT NULL,
    "justificativa" TEXT,
    "motivoRecusa" TEXT,
    "documentoId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pedido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemPedido" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "precoUnitarioCentavos" INTEGER NOT NULL,
    "subtotalCentavos" INTEGER NOT NULL,

    CONSTRAINT "ItemPedido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoricoStatus" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "de" "StatusPedido",
    "para" "StatusPedido" NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "motivo" TEXT,
    "em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HistoricoStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PedidoHistorico" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "linha" INTEGER NOT NULL,
    "data" DATE NOT NULL,
    "clienteId" TEXT NOT NULL,
    "clienteNomeOriginal" TEXT,
    "produtoId" TEXT NOT NULL,
    "vendedorNome" TEXT,
    "quantidade" INTEGER NOT NULL,
    "precoUnitarioCentavos" INTEGER NOT NULL,
    "cancelado" BOOLEAN NOT NULL,

    CONSTRAINT "PedidoHistorico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Documento" (
    "id" TEXT NOT NULL,
    "arquivo" TEXT NOT NULL,
    "tipo" "TipoDocumento" NOT NULL,
    "clienteId" TEXT,
    "enviadoPorId" TEXT NOT NULL,
    "enviadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "situacao" "SituacaoDocumento" NOT NULL DEFAULT 'ENVIADO',
    "confirmadoPorId" TEXT,
    "confirmadoEm" TIMESTAMP(3),
    "resumo" TEXT,
    "encaminhadoPara" "Papel",

    CONSTRAINT "Documento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecucaoAgente" (
    "id" TEXT NOT NULL,
    "documentoId" TEXT NOT NULL,
    "passos" JSONB NOT NULL,
    "ferramentasChamadas" JSONB NOT NULL,
    "resultado" JSONB,
    "erro" TEXT,
    "duracaoMs" INTEGER NOT NULL,
    "custoEstimadoMicrodolares" INTEGER,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExecucaoAgente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiscoChurn" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "calculadoEm" TIMESTAMP(3) NOT NULL,
    "probabilidade" DOUBLE PRECISION NOT NULL,
    "faixa" "FaixaRisco" NOT NULL,
    "motivoPrincipal" TEXT NOT NULL,
    "versaoModelo" TEXT NOT NULL,
    "contatoRegistradoEm" TIMESTAMP(3),
    "contatoRegistradoPorId" TEXT,

    CONSTRAINT "RiscoChurn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistroSincronizacao" (
    "id" TEXT NOT NULL,
    "tipo" "TipoRegistro" NOT NULL,
    "iniciouEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "terminouEm" TIMESTAMP(3),
    "resultado" "ResultadoRegistro" NOT NULL,
    "itensLidos" INTEGER NOT NULL DEFAULT 0,
    "erros" INTEGER NOT NULL DEFAULT 0,
    "pendencias" INTEGER NOT NULL DEFAULT 0,
    "detalhe" TEXT,
    "relatorio" JSONB,

    CONSTRAINT "RegistroSincronizacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_codigoVendedor_key" ON "Usuario"("codigoVendedor");

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_codigoErp_key" ON "Cliente"("codigoErp");

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_cnpj_key" ON "Cliente"("cnpj");

-- CreateIndex
CREATE INDEX "Cliente_codigoVendedor_idx" ON "Cliente"("codigoVendedor");

-- CreateIndex
CREATE INDEX "Cliente_status_idx" ON "Cliente"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Produto_codigoErp_key" ON "Produto"("codigoErp");

-- CreateIndex
CREATE INDEX "Titulo_clienteId_vencimento_idx" ON "Titulo"("clienteId", "vencimento");

-- CreateIndex
CREATE INDEX "Titulo_status_vencimento_idx" ON "Titulo"("status", "vencimento");

-- CreateIndex
CREATE UNIQUE INDEX "Titulo_numero_parcela_key" ON "Titulo"("numero", "parcela");

-- CreateIndex
CREATE UNIQUE INDEX "Contrato_numero_key" ON "Contrato"("numero");

-- CreateIndex
CREATE INDEX "Contrato_clienteId_idx" ON "Contrato"("clienteId");

-- CreateIndex
CREATE INDEX "Contrato_dataLimiteAviso_idx" ON "Contrato"("dataLimiteAviso");

-- CreateIndex
CREATE UNIQUE INDEX "Pedido_numeroErp_key" ON "Pedido"("numeroErp");

-- CreateIndex
CREATE UNIQUE INDEX "Pedido_chaveEnvio_key" ON "Pedido"("chaveEnvio");

-- CreateIndex
CREATE INDEX "Pedido_clienteId_idx" ON "Pedido"("clienteId");

-- CreateIndex
CREATE INDEX "Pedido_vendedorId_status_idx" ON "Pedido"("vendedorId", "status");

-- CreateIndex
CREATE INDEX "Pedido_status_idx" ON "Pedido"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ItemPedido_pedidoId_produtoId_key" ON "ItemPedido"("pedidoId", "produtoId");

-- CreateIndex
CREATE INDEX "HistoricoStatus_pedidoId_em_idx" ON "HistoricoStatus"("pedidoId", "em");

-- CreateIndex
CREATE INDEX "PedidoHistorico_clienteId_data_idx" ON "PedidoHistorico"("clienteId", "data");

-- CreateIndex
CREATE UNIQUE INDEX "PedidoHistorico_numero_linha_key" ON "PedidoHistorico"("numero", "linha");

-- CreateIndex
CREATE INDEX "Documento_situacao_idx" ON "Documento"("situacao");

-- CreateIndex
CREATE INDEX "Documento_clienteId_idx" ON "Documento"("clienteId");

-- CreateIndex
CREATE INDEX "ExecucaoAgente_documentoId_idx" ON "ExecucaoAgente"("documentoId");

-- CreateIndex
CREATE INDEX "RiscoChurn_calculadoEm_faixa_idx" ON "RiscoChurn"("calculadoEm", "faixa");

-- CreateIndex
CREATE UNIQUE INDEX "RiscoChurn_clienteId_calculadoEm_key" ON "RiscoChurn"("clienteId", "calculadoEm");

-- CreateIndex
CREATE INDEX "RegistroSincronizacao_tipo_iniciouEm_idx" ON "RegistroSincronizacao"("tipo", "iniciouEm");

-- AddForeignKey
ALTER TABLE "Titulo" ADD CONSTRAINT "Titulo_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contrato" ADD CONSTRAINT "Contrato_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contrato" ADD CONSTRAINT "Contrato_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "Documento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contrato" ADD CONSTRAINT "Contrato_avisoTratadoPorId_fkey" FOREIGN KEY ("avisoTratadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "Documento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemPedido" ADD CONSTRAINT "ItemPedido_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemPedido" ADD CONSTRAINT "ItemPedido_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricoStatus" ADD CONSTRAINT "HistoricoStatus_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricoStatus" ADD CONSTRAINT "HistoricoStatus_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoHistorico" ADD CONSTRAINT "PedidoHistorico_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoHistorico" ADD CONSTRAINT "PedidoHistorico_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Documento" ADD CONSTRAINT "Documento_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Documento" ADD CONSTRAINT "Documento_enviadoPorId_fkey" FOREIGN KEY ("enviadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Documento" ADD CONSTRAINT "Documento_confirmadoPorId_fkey" FOREIGN KEY ("confirmadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecucaoAgente" ADD CONSTRAINT "ExecucaoAgente_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "Documento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiscoChurn" ADD CONSTRAINT "RiscoChurn_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiscoChurn" ADD CONSTRAINT "RiscoChurn_contatoRegistradoPorId_fkey" FOREIGN KEY ("contatoRegistradoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A salesperson must have an ERP salesperson code, or no client would be in
-- their portfolio (RN-08). Prisma cannot express this, so it is a CHECK.
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_vendedor_tem_codigo"
  CHECK ("papel" <> 'VENDEDOR' OR "codigoVendedor" IS NOT NULL);
