import { createDatabase } from "../src/shared/database/create-database.js";
import { hashPassword } from "../src/shared/security/password.js";

// Development-only password shared by every seeded user. It comes only from
// SEED_PASSWORD in .env; never use these users in production.
const seedPassword = process.env.SEED_PASSWORD;
if (!seedPassword) {
  throw new Error("Set SEED_PASSWORD in .env before running the seed.");
}

const users = [
  {
    nome: "Fernanda Cavalcanti",
    email: "fernanda@distrilux.test",
    papel: "GERENTE",
  },
  {
    nome: "Sérgio Barros",
    email: "sergio@distrilux.test",
    papel: "FINANCEIRO",
  },
  {
    nome: "Lucas Moura",
    email: "lucas@distrilux.test",
    papel: "ADMINISTRADOR",
  },
  {
    nome: "Patrícia",
    email: "patricia@distrilux.test",
    papel: "VENDEDOR",
    codigoVendedor: "V01",
  },
] as const;

const clientes = [
  {
    codigoErp: "C9001",
    razaoSocial: "Construtora Exemplo Ltda",
    cnpj: "11222333000181",
    cidade: "Recife",
    uf: "PE",
    segmento: "Construtora",
    codigoVendedor: "V01",
    limiteCreditoCentavos: 2_000_000,
    status: "ATIVO",
  },
  {
    codigoErp: "C9002",
    razaoSocial: "Revenda Exemplo ME",
    cnpj: "44555666000172",
    cidade: "Caruaru",
    uf: "PE",
    segmento: "Revenda",
    codigoVendedor: "V01",
    limiteCreditoCentavos: 850_000,
    status: "BLOQUEADO",
  },
] as const;

// Fixed, so a second run writes the same rows.
const atualizadoNoErpEm = new Date("2026-11-01T09:00:00-03:00");

const produtos = [
  {
    codigoErp: "P9001",
    descricao: "Cabo flexível 2,5 mm² 100 m",
    categoria: "Cabos",
    unidade: "rolo",
    precoTabelaCentavos: 28_990,
    ativo: true,
  },
  {
    codigoErp: "P9002",
    descricao: "Disjuntor bipolar 32 A",
    categoria: "Disjuntores",
    unidade: "unidade",
    precoTabelaCentavos: 4_750,
    ativo: true,
  },
] as const;

const database = createDatabase();

try {
  // Every seed uses upsert on a unique key, so running it twice creates nothing new.
  // The password hash is updated too, so a changed SEED_PASSWORD takes effect.
  const senhaHash = await hashPassword(seedPassword);
  for (const user of users) {
    await database.usuario.upsert({
      where: { email: user.email },
      update: { nome: user.nome, papel: user.papel, senhaHash },
      create: { ...user, senhaHash },
    });
  }

  for (const cliente of clientes) {
    await database.cliente.upsert({
      where: { codigoErp: cliente.codigoErp },
      update: { ...cliente, atualizadoNoErpEm },
      create: { ...cliente, atualizadoNoErpEm },
    });
  }

  for (const produto of produtos) {
    await database.produto.upsert({
      where: { codigoErp: produto.codigoErp },
      update: { ...produto, atualizadoNoErpEm },
      create: { ...produto, atualizadoNoErpEm },
    });
  }
} finally {
  await database.$disconnect();
}
