const NEW_ID_CHAR = '$';

/**
 * Generate a unique ID using ECDSA
 * @returns A unique ID
 */
export async function generateUniqueId(): Promise<string> {
  try {
    // Generate new ECDSA key pair
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'ECDSA',
        namedCurve: 'P-256',
      },
      true,
      ['sign', 'verify'],
    );

    // Export public key as hex string
    const exported = await crypto.subtle.exportKey('spki', keyPair.publicKey);
    const hashBuffer = await crypto.subtle.digest('SHA-256', exported);
    const hashArray = new Uint8Array(hashBuffer);
    const hashHex = Array.from(hashArray)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    return hashHex;
  } catch (error) {
    console.error('Error generating unique ID:', error);
    return '';
  }
}

/**
 * Generate a simple ID
 * @returns A simple ID
 */
export const generateSimpleId = () =>
  Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

/**
 * Format an ID
 * @param id ID to format
 * @returns Formatted ID
 */
export const formatId = (id: string) =>
  id.length <= 8
    ? id.replace(NEW_ID_CHAR, '')
    : `${id.replace(NEW_ID_CHAR, '').substring(0, 4)}...${id.substring(id.length - 4)}`;

/**
 * Check if an ID is in the list of IDs
 * @param ids List of IDs
 * @param id ID to check
 * @returns Whether the ID is in the list
 */
export const containsId = (ids: string[], id: string) =>
  ids.some(i => i.replace(NEW_ID_CHAR, '') === id.replace(NEW_ID_CHAR, ''));

/**
 * Check if an ID is a new device
 * @param id ID to check
 * @returns Whether the ID is a new device
 */
export const isNewDevice = (id: string) => id.startsWith(NEW_ID_CHAR);

/**
 * Get the list of connected devices for a user
 * @param ids List of device IDs
 * @returns List of connected devices
 */
export function getConnectedDevices(ids: string[]): string[] {
  return ids.filter(id => !isNewDevice(id));
}

/**
 * Get the list of devices for a user
 * @param ids List of device IDs
 * @param userId User ID to add to the list
 * @param isNewDevice Whether the device is new
 * @returns List of devices
 */
export function getDevices(ids: string[], userId: string, isNewDevice = false) {
  const newId = isNewDevice ? NEW_ID_CHAR + userId : userId;
  const connectedDevices = getConnectedDevices(ids);
  return connectedDevices.length ? [...connectedDevices.filter(id => id !== userId), newId] : [userId];
}
