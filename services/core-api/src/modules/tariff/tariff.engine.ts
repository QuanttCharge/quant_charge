/**
 * Tariff engine: per kWh + per min + slab.
 * Money in integer paise — never float.
 */

export type Slab = {
  upToKwh: number;
  ratePerKwhPaise: number;
};

export type Tariff = {
  ratePerKwhPaise: number;
  ratePerMinPaise: number;
  slabs: Slab[];
  gstPct: number;
};

export type ChargeBreakdown = {
  energyPaise: number;
  timePaise: number;
  subtotalPaise: number;
  gstPaise: number;
  totalPaise: number;
};

export function computeEnergyPaise(energyKwh: number, tariff: Tariff): number {
  if (!tariff.slabs.length) {
    return Math.round(energyKwh * tariff.ratePerKwhPaise);
  }
  // Progressive slabs
  let remaining = energyKwh;
  let prev = 0;
  let total = 0;
  for (const slab of tariff.slabs) {
    const span = Math.max(0, Math.min(remaining, slab.upToKwh - prev));
    total += Math.round(span * slab.ratePerKwhPaise);
    remaining -= span;
    prev = slab.upToKwh;
    if (remaining <= 0) break;
  }
  if (remaining > 0) {
    total += Math.round(remaining * tariff.ratePerKwhPaise);
  }
  return total;
}

export function computeSessionCharge(params: {
  energyKwh: number;
  durationMin: number;
  tariff: Tariff;
}): ChargeBreakdown {
  const energyPaise = computeEnergyPaise(params.energyKwh, params.tariff);
  const timePaise = Math.round(params.durationMin * params.tariff.ratePerMinPaise);
  const subtotalPaise = energyPaise + timePaise;
  const gstPaise = Math.round((subtotalPaise * params.tariff.gstPct) / 100);
  return {
    energyPaise,
    timePaise,
    subtotalPaise,
    gstPaise,
    totalPaise: subtotalPaise + gstPaise,
  };
}

// TODO(phase-3): load tariff from DB by charger.tariff_id
