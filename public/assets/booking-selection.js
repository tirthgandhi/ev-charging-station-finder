// Vehicle visibility is independent of the currently selected charger.
export function selectChargingPair(vehicles, chargers, preferredVehicleId, preferredChargerId) {
  const activeVehicles = vehicles.filter((vehicle) => vehicle.isActive);
  const activeChargers = chargers.filter((charger) => charger.operationalStatus === 'active');
  const vehicle =
    activeVehicles.find((item) => item._id === preferredVehicleId) ||
    activeVehicles.find((item) =>
      activeChargers.some((charger) => charger.connectorType === item.connectorType),
    ) ||
    activeVehicles[0];
  const matches = activeChargers.filter(
    (charger) => charger.connectorType === vehicle?.connectorType,
  );
  const charger = matches.find((item) => item._id === preferredChargerId) || matches[0];
  return { activeVehicles, vehicle, charger, compatible: Boolean(vehicle && charger) };
}
