// All interface text lives here so Arabic and Kurdish can be added as sibling files.
export const en = {
  appName: 'Shakarchi Distribution',
  online: 'Online',
  offline: 'Offline',
  pending: (n: number) => (n === 0 ? 'Everything is uploaded' : `${n} waiting to upload`),
  syncNow: 'Upload now',
  notConnected: 'Database not connected yet',
  outlets: 'Outlets',
  noOutlets: 'No outlets on this phone yet.',
  steps: { checkIn: 'Check in', survey: 'Survey', order: 'Order', collect: 'Collect' },
  comingSoon: 'This step is built next.',
}
export type Strings = typeof en
