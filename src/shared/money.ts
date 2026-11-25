const brlFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function assertCentavos(centavos: number): void {
  if (!Number.isSafeInteger(centavos)) {
    throw new RangeError("Amount in cents must be a safe integer.");
  }
}

export function centavosParaReais(centavos: number): number {
  assertCentavos(centavos);
  return centavos / 100;
}

export function formatarReais(centavos: number): string {
  return brlFormatter.format(centavosParaReais(centavos));
}
