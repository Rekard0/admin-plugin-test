export const ZK_SYNC_NETWORKS = [
  'zkMainnet',
  'zkLocalTestnet',
  'zkTestnet',
  'zksyncSepolia',
];
export function isZkSync(networkName: string): boolean {
  return ZK_SYNC_NETWORKS.includes(networkName);
}
