import { randomBytes, scryptSync } from "node:crypto";

import { createDatabase } from "../src/shared/database/create-database.js";

// Development-only password shared by every seeded user.
// Override it with SEED_PASSWORD; never use these users in production.
const seedPassword = process.env.SEED_PASSWORD ?? "distrilux-dev";

// Temporary scrypt hash ("scrypt$salt$hash"). BACK-01 owns password hashing:
// align this helper with the auth module once it lands.
function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
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
  for (const user of users) {
    await database.usuario.upsert({
      where: { email: user.email },
      update: { nome: user.nome, papel: user.papel },
      create: { ...user, senhaHash: hashPassword(seedPassword) },
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
