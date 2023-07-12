import {
  Address,
  Bytes,
  ethereum,
  crypto,
  ByteArray,
  log,
} from '@graphprotocol/graph-ts';

export function getDaoId(dao: Address): string {
  return dao.toHexString();
}

export function getPluginPreparationId(
  dao: Address,
  plugin: Address,
  setupId: Bytes
): string | null {
  let installationId = getPluginInstallationId(dao, plugin);
  if (!installationId) {
    log.critical('Failed to get installationId for dao {}, plugin {}', [
      dao.toHexString(),
      plugin.toHexString(),
    ]);

    return null;
  }

  let preparationId = installationId
    .toHexString()
    .concat('_')
    .concat(pluginSetup.toHexString());

  return preparationId;
}

export function getPluginInstallationId(
  dao: Address,
  plugin: Address
): Bytes | null {
  let installationIdTupleArray = new ethereum.Tuple();
  installationIdTupleArray.push(ethereum.Value.fromAddress(dao));
  installationIdTupleArray.push(ethereum.Value.fromAddress(plugin));

  let installationIdTuple = installationIdTupleArray as ethereum.Tuple;
  let installationIdTupleEncoded = ethereum.encode(
    ethereum.Value.fromTuple(installationIdTuple)
  );

  if (installationIdTupleEncoded) {
    return Bytes.fromHexString(
      crypto
        .keccak256(
          ByteArray.fromHexString(installationIdTupleEncoded.toHexString())
        )
        .toHexString()
    );
  }
  return null;
}

export function getPluginVersionId(
  pluginRepo: string,
  release: i32,
  build: i32
): string {
  return pluginRepo
    .concat('_')
    .concat(release.toString())
    .concat('_')
    .concat(build.toString());
}
